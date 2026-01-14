"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
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
  const params = new URLSearchParams({ spaceId });
  if (filters.category) params.set("category", filters.category);
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/expenses?${params}`);
  if (!response.ok) throw new Error("Failed to fetch expenses");
  const json = await response.json();
  return json.data;
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
    mutationFn: (input: CreateExpenseInput) => createExpense(spaceId, input),
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
    mutationFn: ({
      expenseId,
      input,
    }: {
      expenseId: string;
      input: UpdateExpenseInput;
    }) => updateExpense(spaceId, expenseId, input),
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
    mutationFn: (expenseId: string) => deleteExpense(spaceId, expenseId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.expenses.all,
      });
    },
  });
}
