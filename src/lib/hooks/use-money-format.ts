"use client";

import { useCallback } from "react";
import { useCurrentSpace } from "@/lib/stores/space-store";
import { useFinanceSettings } from "@/lib/queries/finance/settings";
import { formatCurrency } from "@/lib/utils";

/**
 * Returns a formatter that renders amounts in the space's base finance currency
 * by default, or in an explicit `currencyCode` when one is passed (so a budget
 * row can show its own currency while totals use the base). Falls back to the
 * legacy `currency` field, then USD.
 */
export function useMoneyFormat() {
  const currentSpace = useCurrentSpace();
  const { data: settings } = useFinanceSettings(currentSpace?.id || "");
  const base = settings?.baseCurrency ?? settings?.currency ?? "USD";

  return useCallback(
    (amount: number, currencyCode?: string) =>
      formatCurrency(amount, currencyCode ?? base),
    [base]
  );
}
