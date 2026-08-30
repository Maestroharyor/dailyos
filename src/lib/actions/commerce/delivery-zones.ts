"use server";

import type { DeliveryZone as PDeliveryZone } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { type NIGERIA_STATES, normalizeState } from "@/lib/delivery/states";

const deliveryTypeSchema = z.enum(["door_to_door", "interstate_hub", "interstate_doorstep"]);

const deliveryZoneSchema = z.object({
  // Normalised rather than trusted, so "FCT" and "Abuja" cannot become two
  // states in a table a merchant fills in 96 rows at a time. Rejecting an
  // unrecognised state is deliberate: an option filed under a name no address
  // form will ever produce is invisible at checkout and silently unsellable.
  state: z
    .string()
    .min(1)
    .transform((value) => normalizeState(value))
    .refine((value): value is (typeof NIGERIA_STATES)[number] => value !== null, {
      message: "Unrecognised state",
    }),
  name: z.string().min(1).max(120),
  fee: z.number().nonnegative(),
  deliveryType: deliveryTypeSchema.optional(),
  pickupAddress: z.string().max(500).nullable().optional(),
  noteKey: z.string().max(60).nullable().optional(),
  isPinned: z.boolean().optional(),
  qualifiesForFreeShipping: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// z.input, not z.infer: the schema normalises a free-text state into one of
// the canonical names, so the *output* type is that narrow union while a
// caller legitimately sends whatever the merchant typed.
export type DeliveryZoneInput = z.input<typeof deliveryZoneSchema>;

function serializeZone(zone: PDeliveryZone) {
  return {
    id: zone.id,
    state: zone.state,
    name: zone.name,
    fee: Number(zone.fee),
    deliveryType: zone.deliveryType,
    pickupAddress: zone.pickupAddress,
    noteKey: zone.noteKey,
    isPinned: zone.isPinned,
    qualifiesForFreeShipping: zone.qualifiesForFreeShipping,
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
      orderBy: [{ state: "asc" }, { sortOrder: "asc" }, { fee: "asc" }, { name: "asc" }],
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
        state: parsed.data.state,
        name: parsed.data.name.trim(),
        fee: parsed.data.fee,
        deliveryType: parsed.data.deliveryType ?? "door_to_door",
        pickupAddress: parsed.data.pickupAddress?.trim() || null,
        noteKey: parsed.data.noteKey?.trim() || null,
        isPinned: parsed.data.isPinned ?? false,
        qualifiesForFreeShipping: parsed.data.qualifiesForFreeShipping ?? true,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeZone(zone), "Delivery zone created");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      return actionError("This state already has a delivery option with that name");
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
        ...(parsed.data.state !== undefined && { state: parsed.data.state }),
        ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
        ...(parsed.data.fee !== undefined && { fee: parsed.data.fee }),
        ...(parsed.data.deliveryType !== undefined && { deliveryType: parsed.data.deliveryType }),
        ...(parsed.data.pickupAddress !== undefined && {
          pickupAddress: parsed.data.pickupAddress?.trim() || null,
        }),
        ...(parsed.data.noteKey !== undefined && {
          noteKey: parsed.data.noteKey?.trim() || null,
        }),
        ...(parsed.data.isPinned !== undefined && { isPinned: parsed.data.isPinned }),
        ...(parsed.data.qualifiesForFreeShipping !== undefined && {
          qualifiesForFreeShipping: parsed.data.qualifiesForFreeShipping,
        }),
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.sortOrder !== undefined && { sortOrder: parsed.data.sortOrder }),
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serializeZone(zone), "Delivery zone updated");
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      return actionError("This state already has a delivery option with that name");
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
