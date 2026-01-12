"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createBudget,
  updateBudget,
  deleteBudget,
  copyBudgetsFromMonth,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from "@/lib/actions/finance/budgets";

// Types
export interface Budget {
  id: string;
  spaceId: string;
  category: string;
  amount: number;
  month: string;
  spent: number;
  remaining: number;
  percentUsed: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetsResponse {
  budgets: Budget[];
  month: string;
  totals: {
    budget: number;
    spent: number;
    remaining: number;
  };
}

// Fetch functions
async function fetchBudgets(
  spaceId: string,
  month?: string
): Promise<BudgetsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (month) params.set("month", month);

  const response = await fetch(`/api/finance/budgets?${params}`);
  if (!response.ok) throw new Error("Failed to fetch budgets");
  return response.json();
}

// Query hooks
export function useBudgets(spaceId: string, month?: string) {
  return useQuery({
    queryKey: queryKeys.finance.budgets.list(spaceId, month),
    queryFn: () => fetchBudgets(spaceId, month),
    enabled: !!spaceId,
  });
}

export function useBudgetsSuspense(spaceId: string, month?: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.finance.budgets.list(spaceId, month),
    queryFn: () => fetchBudgets(spaceId, month),
  });
}

// Mutation hooks
export function useCreateBudget(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBudgetInput) => createBudget(spaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}

export function useUpdateBudget(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      budgetId,
      input,
    }: {
      budgetId: string;
      input: UpdateBudgetInput;
    }) => updateBudget(spaceId, budgetId, input),
    onMutate: async ({ budgetId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.budgets.all,
      });

      // Get all cached budget queries
      const queries = queryClient.getQueriesData<BudgetsResponse>({
        queryKey: queryKeys.finance.budgets.all,
      });

      // Update the budget in all cached queries
      queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<BudgetsResponse>(queryKey, {
            ...data,
            budgets: data.budgets.map((b) =>
              b.id === budgetId ? { ...b, ...input } : b
            ),
          });
        }
      });

      return { queries };
    },
    onError: (err, variables, context) => {
      // Restore previous values
      context?.queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}

export function useDeleteBudget(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (budgetId: string) => deleteBudget(spaceId, budgetId),
    onMutate: async (budgetId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.budgets.all,
      });

      const queries = queryClient.getQueriesData<BudgetsResponse>({
        queryKey: queryKeys.finance.budgets.all,
      });

      queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<BudgetsResponse>(queryKey, {
            ...data,
            budgets: data.budgets.filter((b) => b.id !== budgetId),
          });
        }
      });

      return { queries };
    },
    onError: (err, budgetId, context) => {
      context?.queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}

export function useCopyBudgets(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fromMonth,
      toMonth,
    }: {
      fromMonth: string;
      toMonth: string;
    }) => copyBudgetsFromMonth(spaceId, fromMonth, toMonth),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}
