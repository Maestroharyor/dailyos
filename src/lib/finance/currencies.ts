// Currency reference data sourced from packages (no hardcoded list):
//   - `currency-codes`       -> ISO 4217 codes + names
//   - `currency-symbol-map`  -> display symbols
//   - `flag-icons` (CSS)     -> flags, via `currencyCountry()` below
import { data as currencyData } from "currency-codes";
import getSymbolFromCurrency from "currency-symbol-map";

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

// Full ISO 4217 list with symbols, built once from the packages.
export const CURRENCIES: CurrencyOption[] = currencyData
  .map((r) => ({
    code: r.code,
    symbol: getSymbolFromCurrency(r.code) || r.code,
    name: r.currency,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

// Curated short list shown by default in currency pickers so users aren't faced
// with all ~150 at once. The base currency is always added on top of this.
export const COMMON_CURRENCY_CODES = [
  "NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR",
  "CAD", "AUD", "AED", "INR", "CNY", "JPY",
];

// Currency codes whose first two letters aren't an ISO country (so the flag
// can't be derived from the prefix). Mapped to a flag-icons country code, or
// empty string where no single flag fits (regional currencies).
const COUNTRY_OVERRIDES: Record<string, string> = {
  EUR: "eu", XOF: "", XAF: "", XCD: "", XPF: "", XDR: "",
};

/**
 * ISO 3166 country code (lowercase) for a currency, used as the flag-icons
 * class suffix: `fi fi-${currencyCountry(code)}`. Derived from the currency's
 * country prefix (USD -> us, NGN -> ng). Returns "" when no single flag applies.
 */
export function currencyCountry(code: string): string {
  const c = code.toUpperCase();
  if (c in COUNTRY_OVERRIDES) return COUNTRY_OVERRIDES[c];
  const cc = c.slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(cc) ? cc : "";
}
