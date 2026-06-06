"use server";

import { revalidatePath } from "next/cache";
import { authorizeSuperAdmin } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";

export interface StorefrontConnection {
  spaceId: string;
  enabled: boolean;
  key: string | null;
}

export interface StorefrontStatusResult {
  spaceId: string;
  enabled: boolean;
  key: string | null;
  connectedSpace: { id: string; name: string } | null;
}

const generateKey = () => crypto.randomUUID().replace(/-/g, "");

/**
 * Storefront connection status for a space. Super-admin only (the key is a
 * secret). Returns the target space's enabled/key plus the single space that is
 * currently connected platform-wide (for the "this will disconnect X" warning).
 */
export async function getStorefrontStatus(
  spaceId: string
): Promise<ReturnType<typeof actionSuccess<StorefrontStatusResult>> | ReturnType<typeof actionError>> {
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

  const connected = await prisma.space.findFirst({
    where: { storefrontEnabled: true },
    select: { id: true, name: true },
  });

  return actionSuccess(
    {
      spaceId: space.id,
      enabled: space.storefrontEnabled,
      key: space.storefrontKey,
      connectedSpace: connected,
    },
    "Storefront status fetched"
  );
}

/**
 * Bind a Space to the external storefront (single platform-wide binding).
 * Disconnects whatever space currently holds it (non-destructive: only the
 * storefront flag/key are cleared, all commerce data is preserved), then
 * enables the target space and generates a key if it doesn't have one.
 * Super-admin only.
 */
export async function connectStorefront(
  spaceId: string
): Promise<ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>> {
  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return actionError(auth.error);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Disconnect any other currently-connected space (preserve their data).
      await tx.space.updateMany({
        where: { storefrontEnabled: true, id: { not: spaceId } },
        data: { storefrontEnabled: false, storefrontKey: null },
      });

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
): Promise<ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>> {
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
 * immediately; VKT must be updated with the new key. Super-admin only.
 */
export async function regenerateStorefrontKey(
  spaceId: string
): Promise<ReturnType<typeof actionSuccess<StorefrontConnection>> | ReturnType<typeof actionError>> {
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
