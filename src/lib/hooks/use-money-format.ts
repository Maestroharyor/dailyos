"use client";

import { useCallback } from "react";
import { useCurrentSpace } from "@/lib/stores/space-store";
import { useFinanceSettings } from "@/lib/queries/finance/settings";
import { formatCurrency } from "@/lib/utils";

/**
 * Returns a formatter that renders amounts in the current space's finance
 * currency (falls back to USD). Use in finance pages instead of the raw
 * `formatCurrency`, which always defaults to USD.
 */
export function useMoneyFormat() {
  const currentSpace = useCurrentSpace();
  const { data: settings } = useFinanceSettings(currentSpace?.id || "");
  const currency = settings?.currency ?? "USD";

  return useCallback(
    (amount: number) => formatCurrency(amount, currency),
    [currency]
  );
}
