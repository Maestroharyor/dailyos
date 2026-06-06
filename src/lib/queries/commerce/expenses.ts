"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
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
export function useCreateExpense(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateExpenseInput) => createExpense(spaceId, input)),
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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });
    },
  });
}
