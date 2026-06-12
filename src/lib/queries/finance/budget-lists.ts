"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listBudgetLists,
  getBudgetList,
  createBudgetList,
  updateBudgetList,
  deleteBudgetList,
  createBudgetSection,
  updateBudgetSection,
  deleteBudgetSection,
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  toggleItemChecked,
  copyFromLastMonth,
  copyFromLegacyBudget,
  type CreateBudgetListInput,
  type UpdateBudgetListInput,
  type CreateBudgetSectionInput,
  type UpdateBudgetSectionInput,
  type CreateBudgetItemInput,
  type UpdateBudgetItemInput,
  type CopyFromLastMonthInput,
  type CopyFromLegacyBudgetInput,
} from "@/lib/actions/finance/budget-lists";

// ---------------------------------------------------------------------------
// Types (shape mirrors the serialized server-action output)
// ---------------------------------------------------------------------------

export interface BudgetItem {
  id: string;
  spaceId: string;
  listId: string;
  sectionId: string;
  label: string;
  amount: number | null;
  spentAmount: number | null;
  currency: string;
  checked: boolean;
  checkedAt: string | null;
  transactionId: string | null;
  recurring: boolean;
  sortOrder: number;
  baseAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetSection {
  id: string;
  listId: string;
  name: string;
  category: string | null;
  collapsed: boolean;
  sortOrder: number;
  items: BudgetItem[];
}

export interface BudgetListMeta {
  id: string;
  spaceId: string;
  name: string;
  month: string | null;
  isTemplate: boolean;
  archived: boolean;
  sortOrder: number;
}

export interface BudgetTotals {
  byCurrency: Record<string, { planned: number; paid: number }>;
  base: {
    currency: string;
    planned: number;
    paid: number;
    remaining: number;
    stale: boolean;
  };
}

export interface BudgetListDetail {
  list: BudgetListMeta;
  sections: BudgetSection[];
  totals: BudgetTotals;
  baseCurrency: string;
}

export type BudgetListRef = { month?: string; listId?: string };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useBudgetLists(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.finance.budgetLists.list(spaceId),
    queryFn: () => unwrapAction(listBudgetLists(spaceId)),
    enabled: !!spaceId,
  });
}

export function useBudgetList(spaceId: string, ref: BudgetListRef) {
  return useQuery({
    queryKey: queryKeys.finance.budgetLists.detail(spaceId, ref),
    queryFn: () => unwrapAction(getBudgetList(spaceId, ref)),
    enabled: !!spaceId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

// Recompute per-currency + base totals from the current sections. Base totals
// are best-effort optimistically (the server reconciles on invalidation): for
// same-currency-as-base items we know the value; cross-currency unchecked items
// fall back to the prior conversion ratio.
function recomputeByCurrency(sections: BudgetSection[]): BudgetTotals["byCurrency"] {
  const byCurrency: BudgetTotals["byCurrency"] = {};
  for (const section of sections) {
    for (const item of section.items) {
      const amt = item.amount ?? 0;
      if (amt > 0) {
        const slot = (byCurrency[item.currency] ??= { planned: 0, paid: 0 });
        slot.planned += amt;
        if (item.checked) slot.paid += amt;
      }
    }
  }
  return byCurrency;
}

type DetailUpdater = (detail: BudgetListDetail) => BudgetListDetail;

function patchDetailCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: DetailUpdater
) {
  const entries = queryClient.getQueriesData<BudgetListDetail>({
    queryKey: queryKeys.finance.budgetLists.all,
  });
  entries.forEach(([key, data]) => {
    // Only the detail queries carry { sections }, list queries are arrays.
    if (data && Array.isArray((data as BudgetListDetail).sections)) {
      queryClient.setQueryData<BudgetListDetail>(key, updater(data));
    }
  });
  return entries;
}

function restoreCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  entries: [readonly unknown[], unknown][]
) {
  entries.forEach(([key, data]) => {
    if (data) queryClient.setQueryData(key as readonly unknown[], data);
  });
}

// Invalidate everything a checklist mutation can touch: the lists, plus the
// transaction/overview caches (checking an item writes an expense).
function invalidateChecklistAndLedger(
  queryClient: ReturnType<typeof useQueryClient>,
  spaceId: string
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.transactions.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.overview(spaceId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgets.all });
}

// ---------------------------------------------------------------------------
// Toggle (optimistic — the high-frequency interaction)
// ---------------------------------------------------------------------------

export function useToggleBudgetItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({ itemId, checked }: { itemId: string; checked: boolean }) =>
      toggleItemChecked(spaceId, itemId, checked)),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => {
        const sections = detail.sections.map((section) => ({
          ...section,
          items: section.items.map((item) =>
            item.id === itemId
              ? { ...item, checked, checkedAt: checked ? new Date().toISOString() : null }
              : item
          ),
        }));
        const byCurrency = recomputeByCurrency(sections);
        const paid = Object.values(byCurrency).reduce((s, c) => s + c.paid, 0);
        const planned = detail.totals.base.planned;
        return {
          ...detail,
          sections,
          totals: {
            byCurrency,
            base: {
              ...detail.totals.base,
              // Approximate base.paid optimistically; server reconciles on settle.
              paid:
                detail.totals.base.currency &&
                Object.keys(byCurrency).length === 1 &&
                byCurrency[detail.totals.base.currency]
                  ? byCurrency[detail.totals.base.currency].paid
                  : paid,
              remaining: planned - paid,
            },
          },
        };
      });
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't update item");
    },
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

export function useCreateBudgetItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateBudgetItemInput) =>
      createBudgetItem(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => {
        if (detail.list.id !== input.listId) return detail;
        const temp: BudgetItem = {
          id: `temp-${Date.now()}`,
          spaceId,
          listId: input.listId,
          sectionId: input.sectionId,
          label: input.label,
          amount: input.amount ?? null,
          spentAmount: null,
          currency: input.currency ?? detail.baseCurrency,
          checked: false,
          checkedAt: null,
          transactionId: null,
          recurring: input.recurring ?? false,
          sortOrder: 9999,
          baseAmount: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const sections = detail.sections.map((s) =>
          s.id === input.sectionId ? { ...s, items: [...s.items, temp] } : s
        );
        return { ...detail, sections, totals: { ...detail.totals, byCurrency: recomputeByCurrency(sections) } };
      });
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't add item");
    },
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

export function useUpdateBudgetItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({ itemId, input }: { itemId: string; input: UpdateBudgetItemInput }) =>
      updateBudgetItem(spaceId, itemId, input)),
    onMutate: async ({ itemId, input }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => {
        const sections = detail.sections.map((section) => ({
          ...section,
          items: section.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  ...(input.label !== undefined && { label: input.label }),
                  ...(input.amount !== undefined && { amount: input.amount }),
                  ...(input.spentAmount !== undefined && { spentAmount: input.spentAmount }),
                  ...(input.currency !== undefined && { currency: input.currency }),
                  ...(input.recurring !== undefined && { recurring: input.recurring }),
                }
              : item
          ),
        }));
        return { ...detail, sections, totals: { ...detail.totals, byCurrency: recomputeByCurrency(sections) } };
      });
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't update item");
    },
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

export function useDeleteBudgetItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((itemId: string) => deleteBudgetItem(spaceId, itemId)),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => {
        const sections = detail.sections.map((section) => ({
          ...section,
          items: section.items.filter((item) => item.id !== itemId),
        }));
        return { ...detail, sections, totals: { ...detail.totals, byCurrency: recomputeByCurrency(sections) } };
      });
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't delete item");
    },
    onSuccess: () => notifySuccess("Item deleted"),
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

// ---------------------------------------------------------------------------
// Section CRUD
// ---------------------------------------------------------------------------

export function useCreateBudgetSection(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((input: CreateBudgetSectionInput) =>
      createBudgetSection(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => {
        if (detail.list.id !== input.listId) return detail;
        const temp: BudgetSection = {
          id: `temp-${Date.now()}`,
          listId: input.listId,
          name: input.name,
          category: input.category ?? null,
          collapsed: false,
          sortOrder: 9999,
          items: [],
        };
        return { ...detail, sections: [...detail.sections, temp] };
      });
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't add section");
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}

export function useUpdateBudgetSection(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction(({ sectionId, input }: { sectionId: string; input: UpdateBudgetSectionInput }) =>
      updateBudgetSection(spaceId, sectionId, input)),
    onMutate: async ({ sectionId, input }) => {
      // Optimistic for the common collapse toggle / rename.
      await queryClient.cancelQueries({ queryKey: queryKeys.finance.budgetLists.all });
      const entries = patchDetailCaches(queryClient, (detail) => ({
        ...detail,
        sections: detail.sections.map((section) =>
          section.id === sectionId ? { ...section, ...input } : section
        ),
      }));
      return { entries };
    },
    onError: (err, _vars, context) => {
      if (context?.entries) restoreCaches(queryClient, context.entries);
      notifyError(err, "Couldn't update section");
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}

export function useDeleteBudgetSection(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((sectionId: string) => deleteBudgetSection(spaceId, sectionId)),
    onSuccess: () => notifySuccess("Section deleted"),
    onError: (err) => notifyError(err, "Couldn't delete section"),
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

// ---------------------------------------------------------------------------
// List CRUD + bulk
// ---------------------------------------------------------------------------

export function useCreateBudgetList(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((input: CreateBudgetListInput) => createBudgetList(spaceId, input)),
    onSuccess: () => notifySuccess("List created"),
    onError: (err) => notifyError(err, "Couldn't create list"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}

export function useUpdateBudgetList(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction(({ listId, input }: { listId: string; input: UpdateBudgetListInput }) =>
      updateBudgetList(spaceId, listId, input)),
    onSuccess: () => notifySuccess("List updated"),
    onError: (err) => notifyError(err, "Couldn't update list"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}

export function useDeleteBudgetList(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((listId: string) => deleteBudgetList(spaceId, listId)),
    onSuccess: () => notifySuccess("List deleted"),
    onError: (err) => notifyError(err, "Couldn't delete list"),
    onSettled: () => invalidateChecklistAndLedger(queryClient, spaceId),
  });
}

export function useCopyFromLastMonth(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((input: CopyFromLastMonthInput) => copyFromLastMonth(spaceId, input)),
    onSuccess: (res) => notifySuccess(`Copied ${res.data?.created ?? 0} item(s)`),
    onError: (err) => notifyError(err, "Couldn't copy items"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}

export function useCopyFromLegacyBudget(spaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: wrapAction((input: CopyFromLegacyBudgetInput) => copyFromLegacyBudget(spaceId, input)),
    onSuccess: (res) => notifySuccess(`Imported ${res.data?.created ?? 0} item(s)`),
    onError: (err) => notifyError(err, "Couldn't import budget"),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.budgetLists.all }),
  });
}
