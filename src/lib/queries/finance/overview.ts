"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { unwrapAction } from "@/lib/action-mutation";
import { getFinanceOverview } from "@/lib/actions/finance/overview";

// Types
export interface FinanceOverview {
  month: string;
  stats: {
    income: number;
    expense: number;
    balance: number;
  };
  expensesByCategory: { name: string; value: number }[];
  recentTransactions: {
    id: string;
    type: "income" | "expense";
    amount: number;
    category: string;
    description: string;
    date: string;
  }[];
}

async function fetchFinanceOverview(
  spaceId: string,
  month?: string
): Promise<FinanceOverview> {
  return unwrapAction(getFinanceOverview(spaceId, month));
}

export function useFinanceOverview(spaceId: string, month?: string) {
  return useQuery({
    queryKey: queryKeys.finance.overview(spaceId, month),
    queryFn: () => fetchFinanceOverview(spaceId, month),
    enabled: !!spaceId,
    // Dashboard-style data: keep it fresh like the commerce dashboard.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
