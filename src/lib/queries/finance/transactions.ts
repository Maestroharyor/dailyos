"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from "@/lib/actions/finance/transactions";

// Types
export interface Transaction {
  id: string;
  spaceId: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  date: string;
  tags: string[];
  recurring: boolean;
  recurrenceType: "weekly" | "monthly" | "yearly" | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  stats: {
    income: number;
    expense: number;
    balance: number;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface TransactionFilters {
  type?: string;
  category?: string;
  month?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchTransactions(
  spaceId: string,
  filters: TransactionFilters
): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.type && filters.type !== "all") params.set("type", filters.type);
  if (filters.category && filters.category !== "all")
    params.set("category", filters.category);
  if (filters.month) params.set("month", filters.month);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/finance/transactions?${params}`);
  if (!response.ok) throw new Error("Failed to fetch transactions");
  return response.json();
}

// Query hooks
export function useTransactions(
  spaceId: string,
  filters: TransactionFilters = {}
) {
  return useQuery({
    queryKey: queryKeys.finance.transactions.list(spaceId, filters),
    queryFn: () => fetchTransactions(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useTransactionsSuspense(
  spaceId: string,
  filters: TransactionFilters = {}
) {
  return useSuspenseQuery({
    queryKey: queryKeys.finance.transactions.list(spaceId, filters),
    queryFn: () => fetchTransactions(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTransactionInput) =>
      createTransaction(spaceId, input),
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.transactions.all,
      });

      const previousTransactions =
        queryClient.getQueryData<TransactionsResponse>(
          queryKeys.finance.transactions.list(spaceId, {})
        );

      if (previousTransactions) {
        const amount = newTransaction.amount;
        const isIncome = newTransaction.type === "income";

        queryClient.setQueryData<TransactionsResponse>(
          queryKeys.finance.transactions.list(spaceId, {}),
          {
            ...previousTransactions,
            transactions: [
              {
                id: `temp-${Date.now()}`,
                spaceId,
                ...newTransaction,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as Transaction,
              ...previousTransactions.transactions,
            ],
            stats: {
              ...previousTransactions.stats,
              income: previousTransactions.stats.income + (isIncome ? amount : 0),
              expense:
                previousTransactions.stats.expense + (isIncome ? 0 : amount),
              balance:
                previousTransactions.stats.balance +
                (isIncome ? amount : -amount),
            },
            pagination: {
              ...previousTransactions.pagination,
              total: previousTransactions.pagination.total + 1,
            },
          }
        );
      }

      return { previousTransactions };
    },
    onError: (err, newTransaction, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(
          queryKeys.finance.transactions.list(spaceId, {}),
          context.previousTransactions
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transactions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}

export function useUpdateTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      input,
    }: {
      transactionId: string;
      input: UpdateTransactionInput;
    }) => updateTransaction(spaceId, transactionId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transactions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}

export function useDeleteTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transactionId: string) =>
      deleteTransaction(spaceId, transactionId),
    onMutate: async (transactionId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.transactions.all,
      });

      const previousTransactions =
        queryClient.getQueryData<TransactionsResponse>(
          queryKeys.finance.transactions.list(spaceId, {})
        );

      if (previousTransactions) {
        const deleted = previousTransactions.transactions.find(
          (t) => t.id === transactionId
        );

        queryClient.setQueryData<TransactionsResponse>(
          queryKeys.finance.transactions.list(spaceId, {}),
          {
            ...previousTransactions,
            transactions: previousTransactions.transactions.filter(
              (t) => t.id !== transactionId
            ),
            stats: deleted
              ? {
                  ...previousTransactions.stats,
                  income:
                    previousTransactions.stats.income -
                    (deleted.type === "income" ? deleted.amount : 0),
                  expense:
                    previousTransactions.stats.expense -
                    (deleted.type === "expense" ? deleted.amount : 0),
                  balance:
                    previousTransactions.stats.balance +
                    (deleted.type === "expense"
                      ? deleted.amount
                      : -deleted.amount),
                }
              : previousTransactions.stats,
            pagination: {
              ...previousTransactions.pagination,
              total: previousTransactions.pagination.total - 1,
            },
          }
        );
      }

      return { previousTransactions };
    },
    onError: (err, transactionId, context) => {
      if (context?.previousTransactions) {
        queryClient.setQueryData(
          queryKeys.finance.transactions.list(spaceId, {}),
          context.previousTransactions
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transactions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
    },
  });
}
