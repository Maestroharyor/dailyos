"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const paymentMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

const updateSettingsSchema = z.object({
  currency: z.string().length(3).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  storeName: z.string().optional(),
  storeAddress: z.string().optional(),
  storePhone: z.string().optional(),
  paymentMethods: z.array(paymentMethodSchema).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export async function updateCommerceSettings(
  spaceId: string,
  input: UpdateSettingsInput
) {
  const authResult = await authorizeAction(spaceId, "manage_account_settings");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const settings = await prisma.commerceSettings.upsert({
      where: { spaceId },
      update: parsed.data,
      create: {
        spaceId,
        ...parsed.data,
        currency: parsed.data.currency ?? "USD",
        paymentMethods: parsed.data.paymentMethods ?? [
          { id: "cash", name: "Cash", isActive: true },
          { id: "card", name: "Card", isActive: true },
          { id: "transfer", name: "Bank Transfer", isActive: true },
        ],
      },
    });

    revalidatePath("/commerce/settings");
    return actionSuccess(settings, "Settings updated");
  } catch (error) {
    console.error("Error updating settings:", error);
    return actionError("Failed to update settings");
  }
}
