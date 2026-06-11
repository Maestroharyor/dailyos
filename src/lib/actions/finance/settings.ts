"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Mirrors the FinanceSettings model defaults in prisma/schema/finance.prisma so
// a space that has never opened settings still gets a sensible starting point.
const DEFAULT_CATEGORIES = [
  "Food",
  "Transportation",
  "Entertainment",
  "Shopping",
  "Bills",
  "Health",
  "Education",
  "Other",
];

const updateSettingsSchema = z.object({
  currency: z.string().min(1).optional(),
  categories: z.array(z.string().min(1)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

export type UpdateFinanceSettingsInput = z.infer<typeof updateSettingsSchema>;

function serializeSettings(
  settings: NonNullable<
    Awaited<ReturnType<typeof prisma.financeSettings.findUnique>>
  >
) {
  return {
    id: settings.id,
    spaceId: settings.spaceId,
    currency: settings.currency,
    categories: settings.categories,
    tags: settings.tags,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function getFinanceSettings(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    // Lazily create the row so the settings page always has something to edit.
    const settings = await prisma.financeSettings.upsert({
      where: { spaceId },
      update: {},
      create: { spaceId, categories: DEFAULT_CATEGORIES },
    });

    return actionSuccess(
      serializeSettings(settings),
      "Finance settings fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching finance settings:", error);
    return actionError("Failed to fetch finance settings");
  }
}

export async function updateFinanceSettings(
  spaceId: string,
  input: UpdateFinanceSettingsInput
) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const settings = await prisma.financeSettings.upsert({
      where: { spaceId },
      update: parsed.data,
      create: {
        spaceId,
        categories: DEFAULT_CATEGORIES,
        ...parsed.data,
      },
    });

    revalidatePath("/finance/settings");
    return actionSuccess(serializeSettings(settings), "Finance settings updated");
  } catch (error) {
    console.error("Error updating finance settings:", error);
    return actionError("Failed to update finance settings");
  }
}
