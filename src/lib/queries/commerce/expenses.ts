"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "@/lib/actions/commerce/expenses";

// Types
export interface Expense {
  id: string;
  spaceId: string;
  category: string;
  amount: number;
  description: string;
  vendor: string | null;
  receiptUrl: string | null;
  date: string;
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensesResponse {
  expenses: Expense[];
  totalAmount: number;
  byCategory: Array<{
    category: string;
    amount: number;
    count: number;
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ExpenseFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchExpenses(
  spaceId: string,
  filters: ExpenseFilters
): Promise<ExpensesResponse> {
  return unwrapAction(listExpenses(spaceId, filters));
}

// Query hooks
export function useExpenses(spaceId: string, filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.expenses.list(spaceId, filters),
    queryFn: () => fetchExpenses(spaceId, filters),
    enabled: !!spaceId,
  });
}

// Mutation hooks
// Optimistic writes use getQueriesData over the `lists(spaceId)` prefix so
// they hit the active filtered/paginated cache pages, not just `{}`.
export function useCreateExpense(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateExpenseInput) => createExpense(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });

      const previous = queryClient.getQueriesData<ExpensesResponse>({
        queryKey: queryKeys.commerce.expenses.lists(spaceId),
      });

      const optimisticExpense: Expense = {
        id: `temp-${Date.now()}`,
        spaceId,
        category: input.category,
        amount: input.amount,
        description: input.description,
        vendor: input.vendor ?? null,
        receiptUrl: input.receiptUrl ?? null,
        date: input.date,
        isRecurring: input.isRecurring ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<ExpensesResponse>(queryKey, {
            ...data,
            expenses: [optimisticExpense, ...data.expenses],
            totalAmount: data.totalAmount + input.amount,
            pagination: {
              ...data.pagination,
              total: data.pagination.total + 1,
            },
          });
        }
      });

      return { previous };
    },
    onError: (err, input, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
      notifyError(err, "Couldn't add expense");
    },
    onSuccess: () => notifySuccess("Expense added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });
    },
  });
}

export function useUpdateExpense(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      expenseId,
      input,
    }: {
      expenseId: string;
      input: UpdateExpenseInput;
    }) => updateExpense(spaceId, expenseId, input)),
    onMutate: async ({ expenseId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });

      const previous = queryClient.getQueriesData<ExpensesResponse>({
        queryKey: queryKeys.commerce.expenses.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<ExpensesResponse>(queryKey, {
            ...data,
            expenses: data.expenses.map((e) =>
              e.id === expenseId ? { ...e, ...input } : e
            ),
          });
        }
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
      notifyError(err, "Couldn't update expense");
    },
    onSuccess: () => notifySuccess("Expense updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });
    },
  });
}

export function useDeleteExpense(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((expenseId: string) => deleteExpense(spaceId, expenseId)),
    onMutate: async (expenseId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });

      const previous = queryClient.getQueriesData<ExpensesResponse>({
        queryKey: queryKeys.commerce.expenses.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (data) {
          const removed = data.expenses.find((e) => e.id === expenseId);
          queryClient.setQueryData<ExpensesResponse>(queryKey, {
            ...data,
            expenses: data.expenses.filter((e) => e.id !== expenseId),
            totalAmount: data.totalAmount - (removed?.amount ?? 0),
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          });
        }
      });

      return { previous };
    },
    onError: (err, expenseId, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
      notifyError(err, "Couldn't delete expense");
    },
    onSuccess: () => notifySuccess("Expense deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });
    },
  });
}
