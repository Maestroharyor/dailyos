"use server";

import { revalidatePath } from "next/cache";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeSuperAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export interface StorefrontConnection {
  spaceId: string;
  enabled: boolean;
  key: string | null;
}

export interface ConnectedStorefrontSpace {
  id: string;
  name: string;
}

export interface StorefrontStatusResult {
  spaceId: string;
  enabled: boolean;
  key: string | null;
  /** Every space currently serving a storefront, including this one. */
  connectedSpaces: ConnectedStorefrontSpace[];
}

const generateKey = () => crypto.randomUUID().replace(/-/g, "");

/**
 * Storefront connection status for a space. Super-admin only (the key is a
 * secret). Also returns every space currently serving a storefront, so the
 * caller can see the full picture — a production space and a staging one are
 * expected to be connected at the same time.
 */
export async function getStorefrontStatus(
  spaceId: string
): Promise<
  ReturnType<typeof actionSuccess<StorefrontStatusResult>> | ReturnType<typeof actionError>
> {
  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return actionError(auth.error);
  }

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, name: true, storefrontEnabled: true, storefrontKey: true },
  });
  if (!space) {
    return actionError("Space not found");
  }

  const connectedSpaces = await prisma.space.findMany({
    where: { storefrontEnabled: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return actionSuccess(
    {
      spaceId: space.id,
      enabled: space.storefrontEnabled,
      key: space.storefrontKey,
      connectedSpaces,
    },
    "Storefront status fetched"
  );
}

/**
 * Bind a Space to an external storefront and mint its key if it has none.
 *
 * Several spaces may be connected at once, each with its own key: that is what
 * lets a staging storefront run against a test space while production serves
 * the live one. Nothing else is touched — connecting here used to disconnect
 * every other space, which silently broke whichever storefront was already
 * pointed at them.
 *
 * The key is what identifies the space downstream (`validateStorefrontKey`
 * resolves it via a unique column, and `resolveWebhookSigner` discriminates
 * Paystack webhooks by trying each connected space's secret), so N connected
 * spaces stay unambiguous.
 *
 * Super-admin only.
 */
export async function connectStorefront(
  spaceId: string
): Promise<
  ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>
> {
  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return actionError(auth.error);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.space.findUnique({
        where: { id: spaceId },
        select: { storefrontKey: true },
      });

      const key = current?.storefrontKey ?? generateKey();
      await tx.space.update({
        where: { id: spaceId },
        data: { storefrontEnabled: true, storefrontKey: key },
      });

      return { spaceId, enabled: true, key } satisfies StorefrontConnection;
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(result, "Storefront connected");
  } catch (error) {
    console.error("Error connecting storefront:", error);
    return actionError("Failed to connect storefront");
  }
}

/**
 * Disconnect the storefront from a Space. Clears the key and disables serving;
 * the space remains a fully usable commerce space with all data intact.
 * Super-admin only.
 */
export async function disconnectStorefront(
  spaceId: string
): Promise<
  ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>
> {
  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return actionError(auth.error);
  }

  try {
    await prisma.space.update({
      where: { id: spaceId },
      data: { storefrontEnabled: false, storefrontKey: null },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(
      { spaceId, enabled: false, key: null } satisfies StorefrontConnection,
      "Storefront disconnected"
    );
  } catch (error) {
    console.error("Error disconnecting storefront:", error);
    return actionError("Failed to disconnect storefront");
  }
}

/**
 * Rotate the storefront key for a connected Space. The old key stops working
 * immediately; the storefront pointed at this space must be updated with the
 * new key. Super-admin only.
 */
export async function regenerateStorefrontKey(
  spaceId: string
): Promise<
  ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>
> {
  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return actionError(auth.error);
  }

  try {
    const key = generateKey();
    await prisma.space.update({
      where: { id: spaceId },
      data: { storefrontEnabled: true, storefrontKey: key },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(
      { spaceId, enabled: true, key } satisfies StorefrontConnection,
      "Storefront key regenerated"
    );
  } catch (error) {
    console.error("Error regenerating storefront key:", error);
    return actionError("Failed to regenerate key");
  }
}
