"use server";

import type { StorePickupSetting as PStorePickupSetting } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { type NIGERIA_STATES, normalizeState } from "@/lib/delivery/states";

/**
 * Store pickup, configured once per space.
 *
 * Two price tiers keyed off whether the customer is in the merchant's own
 * state. The away tier is normally a refundable hold rather than a fee, which
 * is why `awayFeeRefundable` exists: it is what routes the amount into the
 * order's deposit field instead of its shipping fee, and so keeps it out of
 * revenue and out of the free shipping threshold's reach.
 */

const storePickupSchema = z.object({
  isEnabled: z.boolean().optional(),
  label: z.string().min(1).max(120).optional(),
  // Null falls back to CommerceSettings.storeAddress at read time. Two editable
  // copies of one address drift.
  address: z.string().max(500).nullable().optional(),
  homeState: z
    .string()
    .min(1)
    .transform((value) => normalizeState(value))
    .refine((value): value is (typeof NIGERIA_STATES)[number] => value !== null, {
      message: "Unrecognised state",
    }),
  homeFee: z.number().nonnegative(),
  homeWindowLabel: z.string().min(1).max(120),
  homeHoldDays: z.number().int().min(1).max(365),
  homeNoteKey: z.string().min(1).max(60),
  awayFee: z.number().nonnegative(),
  awayFeeRefundable: z.boolean().optional(),
  awayWindowLabel: z.string().min(1).max(120),
  awayHoldDays: z.number().int().min(1).max(365),
  awayNoteKey: z.string().min(1).max(60),
});

// z.input, not z.infer: the schema normalises a free-text state into one of
// the canonical names, so the *output* type is that narrow union while a
// caller legitimately sends whatever the merchant typed.
export type StorePickupInput = z.input<typeof storePickupSchema>;

function serialize(setting: PStorePickupSetting) {
  return {
    id: setting.id,
    isEnabled: setting.isEnabled,
    label: setting.label,
    address: setting.address,
    homeState: setting.homeState,
    homeFee: Number(setting.homeFee),
    homeWindowLabel: setting.homeWindowLabel,
    homeHoldDays: setting.homeHoldDays,
    homeNoteKey: setting.homeNoteKey,
    awayFee: Number(setting.awayFee),
    awayFeeRefundable: setting.awayFeeRefundable,
    awayWindowLabel: setting.awayWindowLabel,
    awayHoldDays: setting.awayHoldDays,
    awayNoteKey: setting.awayNoteKey,
    createdAt: setting.createdAt.toISOString(),
    updatedAt: setting.updatedAt.toISOString(),
  };
}

export type SerializedStorePickupSetting = ReturnType<typeof serialize>;

export async function getStorePickupSetting(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const setting = await prisma.storePickupSetting.findUnique({ where: { spaceId } });
    // Null is a valid answer: a space that has never configured pickup simply
    // does not offer it, and the card renders its own empty state.
    return actionSuccess(setting ? serialize(setting) : null, "Store pickup fetched");
  } catch (error) {
    console.error("Error fetching store pickup setting:", error);
    return actionError("Failed to fetch store pickup settings");
  }
}

export async function saveStorePickupSetting(spaceId: string, input: StorePickupInput) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = storePickupSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const data = parsed.data;

  // Refusing to go live with a missing note is deliberate. The away note is
  // where the customer is told the hold is refunded on collection and retained
  // if they never come, and taking that money on a page which does not say so
  // is not a state this should be able to reach by saving a form.
  if (data.isEnabled) {
    const keys = [data.homeNoteKey, data.awayNoteKey];
    const found = await prisma.deliveryNote.count({ where: { spaceId, key: { in: keys } } });
    if (found < new Set(keys).size) {
      return actionError("Both pickup notes must exist before store pickup can be enabled");
    }
  }

  try {
    const setting = await prisma.storePickupSetting.upsert({
      where: { spaceId },
      create: {
        spaceId,
        isEnabled: data.isEnabled ?? false,
        label: data.label?.trim() || "Store pickup",
        address: data.address?.trim() || null,
        homeState: data.homeState,
        homeFee: data.homeFee,
        homeWindowLabel: data.homeWindowLabel.trim(),
        homeHoldDays: data.homeHoldDays,
        homeNoteKey: data.homeNoteKey,
        awayFee: data.awayFee,
        awayFeeRefundable: data.awayFeeRefundable ?? true,
        awayWindowLabel: data.awayWindowLabel.trim(),
        awayHoldDays: data.awayHoldDays,
        awayNoteKey: data.awayNoteKey,
      },
      update: {
        ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
        ...(data.label !== undefined && { label: data.label.trim() }),
        ...(data.address !== undefined && { address: data.address?.trim() || null }),
        homeState: data.homeState,
        homeFee: data.homeFee,
        homeWindowLabel: data.homeWindowLabel.trim(),
        homeHoldDays: data.homeHoldDays,
        homeNoteKey: data.homeNoteKey,
        awayFee: data.awayFee,
        ...(data.awayFeeRefundable !== undefined && {
          awayFeeRefundable: data.awayFeeRefundable,
        }),
        awayWindowLabel: data.awayWindowLabel.trim(),
        awayHoldDays: data.awayHoldDays,
        awayNoteKey: data.awayNoteKey,
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(serialize(setting), "Store pickup saved");
  } catch (error) {
    console.error("Error saving store pickup setting:", error);
    return actionError("Failed to save store pickup settings");
  }
}
