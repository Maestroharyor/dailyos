import { prisma } from "@/lib/db";
import { fetchLatestRates, isCacheStale, type FxConfig } from "./fx";

type SettingsRow = NonNullable<
  Awaited<ReturnType<typeof prisma.financeSettings.findUnique>>
>;

/**
 * Load a space's FinanceSettings (creating it lazily) and, in auto mode with a
 * stale cache, refresh the FX rates from the API. Best-effort: a failed fetch
 * keeps the existing cache. Server-only (touches Prisma + network).
 */
export async function loadFxSettings(spaceId: string): Promise<SettingsRow> {
  let settings = await prisma.financeSettings.upsert({
    where: { spaceId },
    update: {},
    create: { spaceId },
  });

  if (settings.fxMode === "auto" && isCacheStale(settings.fxRatesFetchedAt)) {
    const rates = await fetchLatestRates(settings.baseCurrency).catch(() => null);
    if (rates) {
      settings = await prisma.financeSettings.update({
        where: { spaceId },
        data: { fxRatesCache: rates, fxRatesFetchedAt: new Date() },
      });
    }
  }

  return settings;
}

export function toFxConfig(settings: SettingsRow): FxConfig {
  return {
    baseCurrency: settings.baseCurrency,
    fxMode: settings.fxMode,
    manualRates: (settings.manualRates ?? {}) as Record<string, number>,
    fxRatesCache: (settings.fxRatesCache ?? {}) as Record<string, number>,
  };
}
