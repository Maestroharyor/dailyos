"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { fetchLatestRates } from "@/lib/finance/fx";

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
  baseCurrency: z.string().min(1).optional(),
  fxMode: z.enum(["auto", "manual"]).optional(),
  manualRates: z.record(z.string(), z.number().positive()).optional(),
  enabledCurrencies: z.array(z.string().min(1)).optional(),
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
    baseCurrency: settings.baseCurrency,
    enabledCurrencies: settings.enabledCurrencies,
    fxMode: settings.fxMode,
    manualRates: (settings.manualRates ?? {}) as Record<string, number>,
    fxRatesCache: (settings.fxRatesCache ?? {}) as Record<string, number>,
    fxRatesFetchedAt: settings.fxRatesFetchedAt
      ? settings.fxRatesFetchedAt.toISOString()
      : null,
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
    // Changing the base currency invalidates the auto-rate cache (it's keyed to
    // the old base); force a refetch on next read by clearing the timestamp.
    const baseChanged = parsed.data.baseCurrency !== undefined;

    const settings = await prisma.financeSettings.upsert({
      where: { spaceId },
      update: {
        ...parsed.data,
        ...(baseChanged && { fxRatesFetchedAt: null }),
      },
      create: {
        spaceId,
        categories: DEFAULT_CATEGORIES,
        ...parsed.data,
      },
    });

    revalidatePath("/finance/settings");
    revalidatePath("/finance/budget");
    return actionSuccess(serializeSettings(settings), "Finance settings updated");
  } catch (error) {
    console.error("Error updating finance settings:", error);
    return actionError("Failed to update finance settings");
  }
}

/**
 * Force-refresh the auto FX rate cache from the FX API (the "refresh rates"
 * button in settings). No-op-friendly: a failed fetch keeps the existing cache.
 */
export async function refreshFxRates(spaceId: string) {
  if (!spaceId) return actionError("spaceId is required");

  const authResult = await authorizeAction(spaceId, "edit_finances");
  if (authResult.error) return actionError(authResult.error);

  try {
    const current = await prisma.financeSettings.upsert({
      where: { spaceId },
      update: {},
      create: { spaceId, categories: DEFAULT_CATEGORIES },
    });

    const rates = await fetchLatestRates(current.baseCurrency).catch(() => null);
    if (!rates) {
      return actionError("Couldn't reach the exchange rate service");
    }

    const settings = await prisma.financeSettings.update({
      where: { spaceId },
      data: { fxRatesCache: rates, fxRatesFetchedAt: new Date() },
    });

    revalidatePath("/finance/settings");
    revalidatePath("/finance/budget");
    return actionSuccess(serializeSettings(settings), "Exchange rates updated");
  } catch (error) {
    console.error("Error refreshing FX rates:", error);
    return actionError("Failed to refresh exchange rates");
  }
}
