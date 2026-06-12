/**
 * Multi-currency conversion for the finance module.
 *
 * Rates are stored as "units of base currency per 1 unit of the foreign
 * currency", keyed by the foreign ISO code. Example, base = NGN:
 *   { "USD": 1650 }  ->  $1 = ₦1650
 *
 * `getRate`/`convert` are pure and safe to call on the client. `fetchLatestRates`
 * hits a free no-key FX API and is meant for server-side cache refresh.
 */

// Subset of FinanceSettings needed for conversion. Kept structural so both the
// Prisma row (server) and the serialized query type (client) satisfy it.
export interface FxConfig {
  baseCurrency: string;
  fxMode: string; // "auto" | "manual"
  manualRates: Record<string, number>;
  fxRatesCache: Record<string, number>;
}

export interface RateResult {
  rate: number;
  // True when a needed rate was missing in the chosen mode and we fell back to
  // the other mode or to 1. Surfaced in the UI as an "approx" warning.
  stale: boolean;
}

function toRateMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [code, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === "string" ? Number(raw) : (raw as number);
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      out[code.toUpperCase()] = n;
    }
  }
  return out;
}

// Units of base currency per 1 unit of `currency`. Returns null when unknown.
function baseRate(config: FxConfig, currency: string): number | null {
  const base = config.baseCurrency.toUpperCase();
  const cur = currency.toUpperCase();
  if (cur === base) return 1;

  const primary = config.fxMode === "manual" ? config.manualRates : config.fxRatesCache;
  const secondary = config.fxMode === "manual" ? config.fxRatesCache : config.manualRates;

  const primaryMap = toRateMap(primary);
  if (primaryMap[cur]) return primaryMap[cur];

  const secondaryMap = toRateMap(secondary);
  if (secondaryMap[cur]) return secondaryMap[cur];

  return null;
}

/**
 * Rate to multiply a `from` amount by to express it in `to`.
 * `stale` is true when any leg of the conversion had to fall back.
 */
export function getRate(config: FxConfig, from: string, to: string): RateResult {
  if (from.toUpperCase() === to.toUpperCase()) return { rate: 1, stale: false };

  const fromBase = baseRate(config, from);
  const toBase = baseRate(config, to);

  if (fromBase === null || toBase === null || toBase === 0) {
    return { rate: 1, stale: true };
  }

  return { rate: fromBase / toBase, stale: false };
}

/** Convert `amount` from one currency to another using the config's rates. */
export function convert(
  config: FxConfig,
  amount: number,
  from: string,
  to: string
): RateResult & { amount: number } {
  const { rate, stale } = getRate(config, from, to);
  return { amount: amount * rate, rate, stale };
}

// How long a cached auto-rate set is considered fresh.
export const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCacheStale(fetchedAt: Date | string | null | undefined): boolean {
  if (!fetchedAt) return true;
  const ts = typeof fetchedAt === "string" ? Date.parse(fetchedAt) : fetchedAt.getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > FX_CACHE_TTL_MS;
}

interface ApiResponse {
  rates?: Record<string, number>;
  result?: string;
}

/**
 * Fetch latest rates for `base` from a free, no-key API and normalize them to
 * "units of base per 1 foreign". Tries open.er-api.com, then exchangerate.host.
 * Returns null when both fail so the caller can keep the existing cache.
 */
export async function fetchLatestRates(
  base: string
): Promise<Record<string, number> | null> {
  const baseCode = base.toUpperCase();
  const endpoints = [
    `https://open.er-api.com/v6/latest/${baseCode}`,
    `https://api.exchangerate.host/latest?base=${baseCode}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        // Rates change slowly; let Next cache for an hour to avoid hammering.
        next: { revalidate: 3600 },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as ApiResponse;
      const apiRates = json.rates;
      if (!apiRates || typeof apiRates !== "object") continue;

      // API gives "foreign per 1 base"; invert to "base per 1 foreign".
      const out: Record<string, number> = {};
      for (const [code, raw] of Object.entries(apiRates)) {
        const perBase = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(perBase) && perBase > 0 && code.toUpperCase() !== baseCode) {
          out[code.toUpperCase()] = 1 / perBase;
        }
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      // Try the next endpoint.
    }
  }

  return null;
}
