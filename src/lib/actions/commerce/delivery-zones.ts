"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
import { z } from "zod";
import type { DeliveryZone as PDeliveryZone } from "@prisma/client";

const deliveryZoneSchema = z.object({
  name: z.string().min(1).max(120),
  fee: z.number().nonnegative(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type DeliveryZoneInput = z.infer<typeof deliveryZoneSchema>;

function serializeZone(zone: PDeliveryZone) {
  return {
    id: zone.id,
    name: zone.name,
    fee: Number(zone.fee),
    isActive: zone.isActive,
    sortOrder: zone.sortOrder,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}

export type SerializedDeliveryZone = ReturnType<typeof serializeZone>;

export async function listDeliveryZones(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { spaceId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return actionSuccess(zones.map(serializeZone), "Delivery zones fetched");
  } catch (error) {
    console.error("Error fetching delivery zones:", error);
    return actionError("Failed to fetch delivery zones");
  }
}

export async function createDeliveryZone(spaceId: string, input: DeliveryZoneInput) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = deliveryZoneSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const zone = await prisma.deliveryZone.create({
      data: {
        spaceId,
        name: parsed.data.name.trim(),
        fee: parsed.data.fee,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeZone(zone), "Delivery zone created");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return actionError("A delivery zone with this name already exists");
    }
    console.error("Error creating delivery zone:", error);
    return actionError("Failed to create delivery zone");
  }
}

export async function updateDeliveryZone(
  spaceId: string,
  zoneId: string,
  input: Partial<DeliveryZoneInput>
) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = deliveryZoneSchema.partial().safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const existing = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, spaceId },
    });
    if (!existing) {
      return actionError("Delivery zone not found");
    }

    const zone = await prisma.deliveryZone.update({
      where: { id: zoneId },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(parsed.data.fee !== undefined && { fee: parsed.data.fee }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeZone(zone), "Delivery zone updated");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return actionError("A delivery zone with this name already exists");
    }
    console.error("Error updating delivery zone:", error);
    return actionError("Failed to update delivery zone");
  }
}

export async function deleteDeliveryZone(spaceId: string, zoneId: string) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const existing = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, spaceId },
    });
    if (!existing) {
      return actionError("Delivery zone not found");
    }

    // Orders reference zones with onDelete: SetNull, so history is safe
    await prisma.deliveryZone.delete({ where: { id: zoneId } });

    revalidatePath("/commerce/settings");
    return actionSuccess(null, "Delivery zone deleted");
  } catch (error) {
    console.error("Error deleting delivery zone:", error);
    return actionError("Failed to delete delivery zone");
  }
}
