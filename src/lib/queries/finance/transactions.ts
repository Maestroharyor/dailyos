"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listTransactions,
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
  currency: string;
  baseAmount: number | null;
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
  recurring?: boolean;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchTransactions(
  spaceId: string,
  filters: TransactionFilters
): Promise<TransactionsResponse> {
  return unwrapAction(listTransactions(spaceId, filters));
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
    mutationFn: wrapAction((input: CreateTransactionInput) =>
      createTransaction(spaceId, input)),
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
      notifyError(err, "Couldn't add transaction");
    },
    onSuccess: () => notifySuccess("Transaction added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transactions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
      // A custom category typed in the form may have been persisted to settings.
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.settings(spaceId),
      });
    },
  });
}

export function useUpdateTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      transactionId,
      input,
    }: {
      transactionId: string;
      input: UpdateTransactionInput;
    }) => updateTransaction(spaceId, transactionId, input)),
    onSuccess: () => notifySuccess("Transaction updated"),
    onError: (err) => notifyError(err, "Couldn't update transaction"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.transactions.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.budgets.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.settings(spaceId),
      });
    },
  });
}

export function useDeleteTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((transactionId: string) =>
      deleteTransaction(spaceId, transactionId)),
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
      notifyError(err, "Couldn't delete transaction");
    },
    onSuccess: () => notifySuccess("Transaction deleted"),
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
