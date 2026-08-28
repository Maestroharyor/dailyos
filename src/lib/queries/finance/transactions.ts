"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  type CreateTransactionInput,
  createTransaction,
  deleteTransaction,
  listTransactions,
  type UpdateTransactionInput,
  updateTransaction,
} from "@/lib/actions/finance/transactions";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";
import { patchFirstPages, patchLists, restoreLists } from "../optimistic";

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
export function useTransactions(spaceId: string, filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: queryKeys.finance.transactions.list(spaceId, filters),
    queryFn: () => fetchTransactions(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useTransactionsSuspense(spaceId: string, filters: TransactionFilters = {}) {
  return useSuspenseQuery({
    queryKey: queryKeys.finance.transactions.list(spaceId, filters),
    queryFn: () => fetchTransactions(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateTransaction(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateTransactionInput) => createTransaction(spaceId, input)),
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.transactions.all,
      });

      const amount = newTransaction.amount;
      const isIncome = newTransaction.type === "income";
      const now = new Date().toISOString();

      // Built field by field rather than spread-and-cast. The input schema and
      // the row are not the same shape, `currency` is optional on the way in
      // and `baseAmount` is the server's to compute, so a cast would have put
      // a half-formed row in the cache and called it a Transaction.
      const optimistic: Transaction = {
        id: `temp-${Date.now()}`,
        spaceId,
        type: newTransaction.type,
        amount,
        currency: newTransaction.currency ?? "",
        baseAmount: null,
        category: newTransaction.category,
        description: newTransaction.description,
        date: newTransaction.date,
        tags: newTransaction.tags,
        recurring: newTransaction.recurring,
        recurrenceType: newTransaction.recurrenceType ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const previous = patchFirstPages<TransactionsResponse>(
        queryClient,
        queryKeys.finance.transactions.lists(spaceId),
        (data) => ({
          ...data,
          transactions: [optimistic, ...data.transactions],
          stats: {
            ...data.stats,
            income: data.stats.income + (isIncome ? amount : 0),
            expense: data.stats.expense + (isIncome ? 0 : amount),
            balance: data.stats.balance + (isIncome ? amount : -amount),
          },
          pagination: { ...data.pagination, total: data.pagination.total + 1 },
        })
      );

      return { previous };
    },
    onError: (err, _newTransaction, context) => {
      restoreLists(queryClient, context?.previous);
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
    mutationFn: wrapAction(
      ({ transactionId, input }: { transactionId: string; input: UpdateTransactionInput }) =>
        updateTransaction(spaceId, transactionId, input)
    ),
    // This hook had no onMutate at all, so an edit did not appear until the
    // server answered. The stats are left to the invalidate: an edit can move
    // an amount and a type at once, and re-deriving the totals here would be a
    // second, divergent implementation of what the server already returns.
    onMutate: async ({ transactionId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.transactions.all,
      });

      const updatedAt = new Date().toISOString();
      const previous = patchLists<TransactionsResponse>(
        queryClient,
        queryKeys.finance.transactions.lists(spaceId),
        (data) => ({
          ...data,
          transactions: data.transactions.map((t) =>
            t.id === transactionId ? { ...t, ...input, updatedAt } : t
          ),
        })
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Transaction updated"),
    onError: (err, _variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update transaction");
    },
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
    mutationFn: wrapAction((transactionId: string) => deleteTransaction(spaceId, transactionId)),
    onMutate: async (transactionId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.transactions.all,
      });

      const previous = patchLists<TransactionsResponse>(
        queryClient,
        queryKeys.finance.transactions.lists(spaceId),
        (data) => {
          const deleted = data.transactions.find((t) => t.id === transactionId);
          if (!deleted) return data;
          return {
            ...data,
            transactions: data.transactions.filter((t) => t.id !== transactionId),
            stats: {
              ...data.stats,
              income: data.stats.income - (deleted.type === "income" ? deleted.amount : 0),
              expense: data.stats.expense - (deleted.type === "expense" ? deleted.amount : 0),
              balance:
                data.stats.balance +
                (deleted.type === "expense" ? deleted.amount : -deleted.amount),
            },
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        }
      );

      return { previous };
    },
    onError: (err, _transactionId, context) => {
      restoreLists(queryClient, context?.previous);
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
