"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import {
  listBudgets,
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
  return unwrapAction(listBudgets(spaceId, month));
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
    mutationFn: wrapAction((input: CreateBudgetInput) => createBudget(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.budgets.all,
      });

      const queries = queryClient.getQueriesData<BudgetsResponse>({
        queryKey: queryKeys.finance.budgets.all,
      });

      const optimisticBudget: Budget = {
        id: `temp-${Date.now()}`,
        spaceId,
        category: input.category,
        amount: input.amount,
        month: input.month,
        spent: 0,
        remaining: input.amount,
        percentUsed: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queries.forEach(([queryKey, data]) => {
        // Only insert into caches showing the same month.
        if (data && data.month === input.month) {
          queryClient.setQueryData<BudgetsResponse>(queryKey, {
            ...data,
            budgets: [...data.budgets, optimisticBudget],
            totals: {
              ...data.totals,
              budget: data.totals.budget + input.amount,
              remaining: data.totals.remaining + input.amount,
            },
          });
        }
      });

      return { queries };
    },
    onError: (err, input, context) => {
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

export function useUpdateBudget(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      budgetId,
      input,
    }: {
      budgetId: string;
      input: UpdateBudgetInput;
    }) => updateBudget(spaceId, budgetId, input)),
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
    mutationFn: wrapAction((budgetId: string) => deleteBudget(spaceId, budgetId)),
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
    mutationFn: wrapAction(({
      fromMonth,
      toMonth,
    }: {
      fromMonth: string;
      toMonth: string;
    }) => copyBudgetsFromMonth(spaceId, fromMonth, toMonth)),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}
