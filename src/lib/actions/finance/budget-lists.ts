"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  convert,
  fetchLatestRates,
  isCacheStale,
  type FxConfig,
} from "@/lib/finance/fx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, m - 1, 1));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type SettingsRow = NonNullable<
  Awaited<ReturnType<typeof prisma.financeSettings.findUnique>>
>;

function toFxConfig(settings: SettingsRow): FxConfig {
  return {
    baseCurrency: settings.baseCurrency,
    fxMode: settings.fxMode,
    manualRates: (settings.manualRates ?? {}) as Record<string, number>,
    fxRatesCache: (settings.fxRatesCache ?? {}) as Record<string, number>,
  };
}

// Ensure a FinanceSettings row exists and, in auto mode with a stale cache,
// refresh the rates from the FX API. Best-effort: a failed fetch keeps the
// existing cache. Returns the (possibly refreshed) settings row.
async function loadFinanceSettings(spaceId: string): Promise<SettingsRow> {
  let settings = await prisma.financeSettings.upsert({
    where: { spaceId },
    update: {},
    create: { spaceId },
  });

  if (settings.fxMode === "auto" && isCacheStale(settings.fxRatesFetchedAt)) {
    const rates = await fetchLatestRates(settings.baseCurrency).catch(() => null);
    if (rates) {
      settings = await prisma.financeSettings.update({
        where: { spaceId },
        data: { fxRatesCache: rates, fxRatesFetchedAt: new Date() },
      });
    }
  }

  return settings;
}

// Persist a custom category to FinanceSettings (mirrors transactions.ensureCategory).
async function ensureCategory(spaceId: string, category?: string) {
  if (!category) return;
  const settings = await prisma.financeSettings.findUnique({
    where: { spaceId },
    select: { categories: true },
  });
  if (settings && !settings.categories.includes(category)) {
    await prisma.financeSettings.update({
      where: { spaceId },
      data: { categories: [...settings.categories, category] },
    });
  }
}

// Resolve the category used when logging an item's expense.
function resolveCategory(
  itemCategory: string | null,
  sectionCategory: string | null,
  label: string
): string {
  return itemCategory?.trim() || sectionCategory?.trim() || label.trim();
}

type ItemWithTx = {
  id: string;
  spaceId: string;
  listId: string;
  sectionId: string;
  label: string;
  amount: unknown;
  currency: string;
  checked: boolean;
  checkedAt: Date | null;
  transactionId: string | null;
  recurring: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  transaction?: { baseAmount: unknown } | null;
};

function serializeItem(item: ItemWithTx) {
  return {
    id: item.id,
    spaceId: item.spaceId,
    listId: item.listId,
    sectionId: item.sectionId,
    label: item.label,
    amount: item.amount == null ? null : Number(item.amount),
    currency: item.currency,
    checked: item.checked,
    checkedAt: item.checkedAt ? item.checkedAt.toISOString() : null,
    transactionId: item.transactionId,
    recurring: item.recurring,
    sortOrder: item.sortOrder,
    baseAmount:
      item.transaction?.baseAmount == null
        ? null
        : Number(item.transaction.baseAmount),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type SerializedItem = ReturnType<typeof serializeItem>;

interface CurrencyTotal {
  planned: number;
  paid: number;
}

function computeTotals(
  sections: { items: SerializedItem[] }[],
  fxConfig: FxConfig
) {
  const byCurrency: Record<string, CurrencyTotal> = {};
  let basePlanned = 0;
  let basePaid = 0;
  let stale = false;
  const base = fxConfig.baseCurrency;

  for (const section of sections) {
    for (const item of section.items) {
      const amt = item.amount ?? 0;

      if (amt > 0) {
        const slot = (byCurrency[item.currency] ??= { planned: 0, paid: 0 });
        slot.planned += amt;
        if (item.checked) slot.paid += amt;
      }

      // Base-currency rollup. Checked+linked items use the rate captured at
      // payment time (stable history); everything else converts at the current rate.
      if (item.checked && item.baseAmount != null) {
        basePlanned += item.baseAmount;
        basePaid += item.baseAmount;
      } else if (amt > 0) {
        const conv = convert(fxConfig, amt, item.currency, base);
        if (conv.stale) stale = true;
        basePlanned += conv.amount;
        if (item.checked) basePaid += conv.amount;
      }
    }
  }

  return {
    byCurrency,
    base: {
      currency: base,
      planned: basePlanned,
      paid: basePaid,
      remaining: basePlanned - basePaid,
      stale,
    },
  };
}

function serializeList(list: {
  id: string;
  spaceId: string;
  name: string;
  month: string | null;
  isTemplate: boolean;
  archivedAt: Date | null;
  sortOrder: number;
}) {
  return {
    id: list.id,
    spaceId: list.spaceId,
    name: list.name,
    month: list.month,
    isTemplate: list.isTemplate,
    archived: list.archivedAt != null,
    sortOrder: list.sortOrder,
  };
}

// Upsert the single monthly list for a month (creates an empty one on first read).
async function ensureMonthList(spaceId: string, month: string) {
  return prisma.budgetList.upsert({
    where: { spaceId_month: { spaceId, month } },
    update: {},
    create: { spaceId, month, name: monthLabel(month) },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listBudgetLists(spaceId: string) {
  if (!spaceId) return actionError("spaceId is required");

  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) return actionError(authResult.error);

  try {
    const lists = await prisma.budgetList.findMany({
      where: { spaceId, archivedAt: null },
      orderBy: [{ month: "desc" }, { sortOrder: "asc" }],
    });
    return actionSuccess(lists.map(serializeList), "Budget lists fetched");
  } catch (error) {
    console.error("Error listing budget lists:", error);
    return actionError("Failed to list budget lists");
  }
}

export async function getBudgetList(
  spaceId: string,
  ref: { month?: string; listId?: string } = {}
) {
  if (!spaceId) return actionError("spaceId is required");

  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) return actionError(authResult.error);

  try {
    const settings = await loadFinanceSettings(spaceId);
    const fxConfig = toFxConfig(settings);

    let list;
    if (ref.listId) {
      list = await prisma.budgetList.findFirst({
        where: { id: ref.listId, spaceId },
      });
      if (!list) return actionError("List not found");
    } else {
      const month = ref.month && MONTH_RE.test(ref.month) ? ref.month : currentMonth();
      // On-read catch-up: carry recurring items forward into this month.
      await materializeBudgetRecurring(spaceId, month);
      list = await ensureMonthList(spaceId, month);
    }

    const sectionRows = await prisma.budgetSection.findMany({
      where: { listId: list.id, spaceId },
      orderBy: { sortOrder: "asc" },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { transaction: { select: { baseAmount: true } } },
        },
      },
    });

    const sections = sectionRows.map((s) => ({
      id: s.id,
      listId: s.listId,
      name: s.name,
      category: s.category,
      collapsed: s.collapsed,
      sortOrder: s.sortOrder,
      items: s.items.map(serializeItem),
    }));

    const totals = computeTotals(sections, fxConfig);

    return actionSuccess(
      {
        list: serializeList(list),
        sections,
        totals,
        baseCurrency: settings.baseCurrency,
      },
      "Budget list fetched"
    );
  } catch (error) {
    console.error("Error fetching budget list:", error);
    return actionError("Failed to fetch budget list");
  }
}

// ---------------------------------------------------------------------------
// List CRUD
// ---------------------------------------------------------------------------

const createListSchema = z.object({
  name: z.string().min(1),
  month: z.string().regex(MONTH_RE).nullable().optional(),
  isTemplate: z.boolean().optional(),
});

export type CreateBudgetListInput = z.infer<typeof createListSchema>;

export async function createBudgetList(
  spaceId: string,
  input: CreateBudgetListInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = createListSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const list = await prisma.budgetList.create({
      data: {
        spaceId,
        name: parsed.data.name.trim(),
        month: parsed.data.month ?? null,
        isTemplate: parsed.data.isTemplate ?? false,
      },
    });
    revalidatePath("/finance/budget");
    return actionSuccess(serializeList(list), "List created");
  } catch (error) {
    console.error("Error creating budget list:", error);
    return actionError("Failed to create list");
  }
}

const updateListSchema = z.object({
  name: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateBudgetListInput = z.infer<typeof updateListSchema>;

export async function updateBudgetList(
  spaceId: string,
  listId: string,
  input: UpdateBudgetListInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = updateListSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const { archived, ...rest } = parsed.data;
    const list = await prisma.budgetList.update({
      where: { id: listId, spaceId },
      data: {
        ...rest,
        ...(archived !== undefined && { archivedAt: archived ? new Date() : null }),
      },
    });
    revalidatePath("/finance/budget");
    return actionSuccess(serializeList(list), "List updated");
  } catch (error) {
    console.error("Error updating budget list:", error);
    return actionError("Failed to update list");
  }
}

export async function deleteBudgetList(spaceId: string, listId: string) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  try {
    // Delete linked expense transactions of checked items before cascading.
    const linked = await prisma.budgetItem.findMany({
      where: { listId, spaceId, transactionId: { not: null } },
      select: { transactionId: true },
    });
    const txIds = linked
      .map((i) => i.transactionId)
      .filter((id): id is string => id !== null);

    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { id: { in: txIds }, spaceId } }),
      prisma.budgetList.delete({ where: { id: listId, spaceId } }),
    ]);

    revalidatePath("/finance/budget");
    revalidatePath("/finance");
    return actionSuccess(null, "List deleted");
  } catch (error) {
    console.error("Error deleting budget list:", error);
    return actionError("Failed to delete list");
  }
}

// ---------------------------------------------------------------------------
// Section CRUD
// ---------------------------------------------------------------------------

const createSectionSchema = z.object({
  listId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type CreateBudgetSectionInput = z.infer<typeof createSectionSchema>;

export async function createBudgetSection(
  spaceId: string,
  input: CreateBudgetSectionInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    // Guard: the list must belong to this space.
    const list = await prisma.budgetList.findFirst({
      where: { id: parsed.data.listId, spaceId },
      select: { id: true },
    });
    if (!list) return actionError("List not found");

    const count = await prisma.budgetSection.count({
      where: { listId: parsed.data.listId },
    });

    const section = await prisma.budgetSection.create({
      data: {
        spaceId,
        listId: parsed.data.listId,
        name: parsed.data.name.trim(),
        category: parsed.data.category?.trim() || null,
        sortOrder: parsed.data.sortOrder ?? count,
      },
    });
    revalidatePath("/finance/budget");
    return actionSuccess(section, "Section created");
  } catch (error) {
    console.error("Error creating section:", error);
    return actionError("Failed to create section");
  }
}

const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  collapsed: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateBudgetSectionInput = z.infer<typeof updateSectionSchema>;

export async function updateBudgetSection(
  spaceId: string,
  sectionId: string,
  input: UpdateBudgetSectionInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const data = {
      ...parsed.data,
      ...(parsed.data.category !== undefined && {
        category: parsed.data.category?.trim() || null,
      }),
    };
    const section = await prisma.budgetSection.update({
      where: { id: sectionId, spaceId },
      data,
    });
    revalidatePath("/finance/budget");
    return actionSuccess(section, "Section updated");
  } catch (error) {
    console.error("Error updating section:", error);
    return actionError("Failed to update section");
  }
}

export async function deleteBudgetSection(spaceId: string, sectionId: string) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  try {
    const linked = await prisma.budgetItem.findMany({
      where: { sectionId, spaceId, transactionId: { not: null } },
      select: { transactionId: true },
    });
    const txIds = linked
      .map((i) => i.transactionId)
      .filter((id): id is string => id !== null);

    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { id: { in: txIds }, spaceId } }),
      prisma.budgetSection.delete({ where: { id: sectionId, spaceId } }),
    ]);

    revalidatePath("/finance/budget");
    revalidatePath("/finance");
    return actionSuccess(null, "Section deleted");
  } catch (error) {
    console.error("Error deleting section:", error);
    return actionError("Failed to delete section");
  }
}

// ---------------------------------------------------------------------------
// Item CRUD
// ---------------------------------------------------------------------------

const createItemSchema = z.object({
  listId: z.string().min(1),
  sectionId: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  recurring: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateBudgetItemInput = z.infer<typeof createItemSchema>;

export async function createBudgetItem(
  spaceId: string,
  input: CreateBudgetItemInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const section = await prisma.budgetSection.findFirst({
      where: { id: parsed.data.sectionId, spaceId, listId: parsed.data.listId },
      select: { id: true },
    });
    if (!section) return actionError("Section not found");

    const settings = await prisma.financeSettings.findUnique({
      where: { spaceId },
      select: { baseCurrency: true },
    });
    const count = await prisma.budgetItem.count({
      where: { sectionId: parsed.data.sectionId },
    });

    const item = await prisma.budgetItem.create({
      data: {
        spaceId,
        listId: parsed.data.listId,
        sectionId: parsed.data.sectionId,
        label: parsed.data.label.trim(),
        amount: parsed.data.amount ?? null,
        currency: parsed.data.currency || settings?.baseCurrency || "NGN",
        category: parsed.data.category?.trim() || null,
        recurring: parsed.data.recurring ?? false,
        sortOrder: parsed.data.sortOrder ?? count,
      },
    });

    if (parsed.data.category) await ensureCategory(spaceId, parsed.data.category.trim());

    revalidatePath("/finance/budget");
    return actionSuccess(serializeItem(item), "Item added");
  } catch (error) {
    console.error("Error creating item:", error);
    return actionError("Failed to add item");
  }
}

const updateItemSchema = z.object({
  label: z.string().min(1).optional(),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  recurring: z.boolean().optional(),
  sectionId: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateBudgetItemInput = z.infer<typeof updateItemSchema>;

export async function updateBudgetItem(
  spaceId: string,
  itemId: string,
  input: UpdateBudgetItemInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const existing = await prisma.budgetItem.findFirst({
      where: { id: itemId, spaceId },
      include: { section: { select: { category: true } } },
    });
    if (!existing) return actionError("Item not found");

    const data = {
      ...parsed.data,
      ...(parsed.data.category !== undefined && {
        category: parsed.data.category?.trim() || null,
      }),
      ...(parsed.data.label !== undefined && { label: parsed.data.label.trim() }),
    };

    // Simple path: unchecked items have no linked transaction to keep in sync.
    if (!existing.checked) {
      const item = await prisma.budgetItem.update({
        where: { id: itemId, spaceId },
        data,
        include: { transaction: { select: { baseAmount: true } } },
      });
      if (parsed.data.category) await ensureCategory(spaceId, parsed.data.category.trim());
      revalidatePath("/finance/budget");
      return actionSuccess(serializeItem(item), "Item updated");
    }

    // Checked item: keep the linked expense transaction consistent.
    const settings = await loadFinanceSettings(spaceId);
    const fxConfig = toFxConfig(settings);

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.budgetItem.update({
        where: { id: itemId, spaceId },
        data,
      });

      const amount = updated.amount == null ? 0 : Number(updated.amount);
      const cat = resolveCategory(
        updated.category,
        existing.section.category,
        updated.label
      );
      const hasAmount = amount > 0;

      if (updated.transactionId) {
        if (hasAmount) {
          const { rate } = convert(fxConfig, 1, updated.currency, settings.baseCurrency);
          await tx.transaction.update({
            where: { id: updated.transactionId, spaceId },
            data: {
              amount,
              currency: updated.currency,
              fxRate: rate,
              baseAmount: amount * rate,
              category: cat,
              description: updated.label,
            },
          });
        } else {
          // Amount cleared: drop the ledger entry, item stays checked.
          await tx.transaction.delete({ where: { id: updated.transactionId, spaceId } });
          return tx.budgetItem.update({
            where: { id: itemId, spaceId },
            data: { transactionId: null },
            include: { transaction: { select: { baseAmount: true } } },
          });
        }
      } else if (hasAmount) {
        // Amount added to an already-checked, previously amount-less item.
        const { rate } = convert(fxConfig, 1, updated.currency, settings.baseCurrency);
        const created = await tx.transaction.create({
          data: {
            spaceId,
            type: "expense",
            amount,
            currency: updated.currency,
            fxRate: rate,
            baseAmount: amount * rate,
            category: cat,
            description: updated.label,
            date: startOfToday(),
          },
        });
        return tx.budgetItem.update({
          where: { id: itemId, spaceId },
          data: { transactionId: created.id },
          include: { transaction: { select: { baseAmount: true } } },
        });
      }

      return tx.budgetItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { transaction: { select: { baseAmount: true } } },
      });
    });

    if (parsed.data.category) await ensureCategory(spaceId, parsed.data.category.trim());
    revalidatePath("/finance/budget");
    revalidatePath("/finance");
    return actionSuccess(serializeItem(item), "Item updated");
  } catch (error) {
    console.error("Error updating item:", error);
    return actionError("Failed to update item");
  }
}

export async function deleteBudgetItem(spaceId: string, itemId: string) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  try {
    const item = await prisma.budgetItem.findFirst({
      where: { id: itemId, spaceId },
      select: { transactionId: true },
    });
    if (!item) return actionError("Item not found");

    if (item.transactionId) {
      await prisma.$transaction([
        prisma.transaction.delete({ where: { id: item.transactionId, spaceId } }),
        prisma.budgetItem.delete({ where: { id: itemId, spaceId } }),
      ]);
    } else {
      await prisma.budgetItem.delete({ where: { id: itemId, spaceId } });
    }

    revalidatePath("/finance/budget");
    revalidatePath("/finance");
    return actionSuccess(null, "Item deleted");
  } catch (error) {
    console.error("Error deleting item:", error);
    return actionError("Failed to delete item");
  }
}

// ---------------------------------------------------------------------------
// Toggle (the ledger-integrity critical path)
// ---------------------------------------------------------------------------

export async function toggleItemChecked(
  spaceId: string,
  itemId: string,
  checked: boolean
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  try {
    const item = await prisma.budgetItem.findFirst({
      where: { id: itemId, spaceId },
      include: { section: { select: { category: true } } },
    });
    if (!item) return actionError("Item not found");

    // No-op if already in the requested state.
    if (item.checked === checked) {
      const fresh = await prisma.budgetItem.findUniqueOrThrow({
        where: { id: itemId },
        include: { transaction: { select: { baseAmount: true } } },
      });
      return actionSuccess(serializeItem(fresh), "No change");
    }

    const amount = item.amount == null ? 0 : Number(item.amount);

    let result: ItemWithTx;

    if (checked) {
      if (amount <= 0) {
        // Amount-less item: just mark done, no ledger entry.
        result = await prisma.budgetItem.update({
          where: { id: itemId, spaceId },
          data: { checked: true, checkedAt: new Date() },
          include: { transaction: { select: { baseAmount: true } } },
        });
      } else {
        const settings = await loadFinanceSettings(spaceId);
        const fxConfig = toFxConfig(settings);
        const { rate } = convert(fxConfig, 1, item.currency, settings.baseCurrency);
        const cat = resolveCategory(item.category, item.section.category, item.label);

        result = await prisma.$transaction(async (tx) => {
          const created = await tx.transaction.create({
            data: {
              spaceId,
              type: "expense",
              amount,
              currency: item.currency,
              fxRate: rate,
              baseAmount: amount * rate,
              category: cat,
              description: item.label,
              date: startOfToday(),
            },
          });
          return tx.budgetItem.update({
            where: { id: itemId, spaceId },
            data: { checked: true, checkedAt: new Date(), transactionId: created.id },
            include: { transaction: { select: { baseAmount: true } } },
          });
        });

        await ensureCategory(spaceId, cat);
      }
    } else {
      // Uncheck: remove the linked expense (if any) and clear the flag.
      result = await prisma.$transaction(async (tx) => {
        if (item.transactionId) {
          await tx.transaction
            .delete({ where: { id: item.transactionId, spaceId } })
            .catch(() => null); // already gone (manual delete) — proceed
        }
        return tx.budgetItem.update({
          where: { id: itemId, spaceId },
          data: { checked: false, checkedAt: null, transactionId: null },
          include: { transaction: { select: { baseAmount: true } } },
        });
      });
    }

    revalidatePath("/finance/budget");
    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    return actionSuccess(serializeItem(result), checked ? "Item checked" : "Item unchecked");
  } catch (error) {
    console.error("Error toggling item:", error);
    return actionError("Failed to update item");
  }
}

// ---------------------------------------------------------------------------
// Bulk: recurring carry-forward, copy-from-last-month, legacy import
// ---------------------------------------------------------------------------

// Find the most recent monthly list strictly before `month`.
async function previousMonthList(spaceId: string, month: string) {
  return prisma.budgetList.findFirst({
    where: { spaceId, isTemplate: false, archivedAt: null, month: { lt: month, not: null } },
    orderBy: { month: "desc" },
    include: {
      sections: { include: { items: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

// Ensure a section with `name` exists in `listId`, returning its id. Reuses an
// existing same-named section so carried-forward items don't duplicate sections.
async function ensureSection(
  spaceId: string,
  listId: string,
  name: string,
  category: string | null,
  sortOrder: number
): Promise<string> {
  const existing = await prisma.budgetSection.findFirst({
    where: { listId, spaceId, name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.budgetSection.create({
    data: { spaceId, listId, name, category, sortOrder },
  });
  return created.id;
}

/**
 * On-read catch-up for recurring items. Carries items flagged `recurring` from
 * the most recent prior month's list into `month` (as fresh, unchecked items),
 * skipping any that already exist (same label, same section name). Idempotent.
 */
export async function materializeBudgetRecurring(spaceId: string, month: string) {
  if (!spaceId || !MONTH_RE.test(month)) return actionError("Invalid month");

  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  try {
    const prev = await previousMonthList(spaceId, month);
    if (!prev) return actionSuccess({ created: 0 }, "No recurring source");

    const recurringBySection = prev.sections
      .map((s) => ({ section: s, items: s.items.filter((i) => i.recurring) }))
      .filter((g) => g.items.length > 0);

    if (recurringBySection.length === 0) {
      return actionSuccess({ created: 0 }, "No recurring items");
    }

    const target = await ensureMonthList(spaceId, month);

    // Labels already present in the target month, keyed by section name.
    const existingTarget = await prisma.budgetSection.findMany({
      where: { listId: target.id, spaceId },
      include: { items: { select: { label: true } } },
    });
    const present = new Set(
      existingTarget.flatMap((s) => s.items.map((i) => `${s.name}::${i.label}`))
    );

    let created = 0;
    for (let si = 0; si < recurringBySection.length; si++) {
      const { section, items } = recurringBySection[si];
      const targetSectionId = await ensureSection(
        spaceId,
        target.id,
        section.name,
        section.category,
        section.sortOrder
      );
      for (let ii = 0; ii < items.length; ii++) {
        const item = items[ii];
        if (present.has(`${section.name}::${item.label}`)) continue;
        await prisma.budgetItem.create({
          data: {
            spaceId,
            listId: target.id,
            sectionId: targetSectionId,
            label: item.label,
            amount: item.amount,
            currency: item.currency,
            category: item.category,
            recurring: true,
            sortOrder: ii,
          },
        });
        created++;
      }
    }

    return actionSuccess({ created }, "Recurring items materialized");
  } catch (error) {
    console.error("Error materializing recurring budget items:", error);
    return actionError("Failed to materialize recurring items");
  }
}

const copyFromLastMonthSchema = z.object({
  toMonth: z.string().regex(MONTH_RE),
});

export type CopyFromLastMonthInput = z.infer<typeof copyFromLastMonthSchema>;

/**
 * Copy all UNCHECKED items (and the sections holding them) from the most recent
 * prior month into `toMonth`. Never carries checked/paid state. Skips items that
 * already exist in the target (same section name + label).
 */
export async function copyFromLastMonth(
  spaceId: string,
  input: CopyFromLastMonthInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = copyFromLastMonthSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const prev = await previousMonthList(spaceId, parsed.data.toMonth);
    if (!prev) return actionError("No previous budget to copy from");

    const target = await ensureMonthList(spaceId, parsed.data.toMonth);

    const existingTarget = await prisma.budgetSection.findMany({
      where: { listId: target.id, spaceId },
      include: { items: { select: { label: true } } },
    });
    const present = new Set(
      existingTarget.flatMap((s) => s.items.map((i) => `${s.name}::${i.label}`))
    );

    let created = 0;
    for (const section of prev.sections) {
      const unchecked = section.items.filter((i) => !i.checked);
      if (unchecked.length === 0) continue;

      const targetSectionId = await ensureSection(
        spaceId,
        target.id,
        section.name,
        section.category,
        section.sortOrder
      );

      for (let ii = 0; ii < unchecked.length; ii++) {
        const item = unchecked[ii];
        if (present.has(`${section.name}::${item.label}`)) continue;
        await prisma.budgetItem.create({
          data: {
            spaceId,
            listId: target.id,
            sectionId: targetSectionId,
            label: item.label,
            amount: item.amount,
            currency: item.currency,
            category: item.category,
            recurring: item.recurring,
            sortOrder: ii,
          },
        });
        created++;
      }
    }

    revalidatePath("/finance/budget");
    return actionSuccess({ created }, "Items copied");
  } catch (error) {
    console.error("Error copying from last month:", error);
    return actionError("Failed to copy items");
  }
}

const legacyImportSchema = z.object({
  month: z.string().regex(MONTH_RE),
});

export type CopyFromLegacyBudgetInput = z.infer<typeof legacyImportSchema>;

/**
 * One-time importer: turn legacy category-cap Budget rows for a month into a
 * checklist (an "Imported" section with one unchecked item per budget).
 */
export async function copyFromLegacyBudget(
  spaceId: string,
  input: CopyFromLegacyBudgetInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if (authResult.error) return actionError(authResult.error);

  const parsed = legacyImportSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid input");

  try {
    const legacy = await prisma.budget.findMany({
      where: { spaceId, month: parsed.data.month },
      orderBy: { category: "asc" },
    });
    if (legacy.length === 0) return actionError("No legacy budgets for this month");

    const settings = await prisma.financeSettings.findUnique({
      where: { spaceId },
      select: { baseCurrency: true },
    });
    const baseCurrency = settings?.baseCurrency || "NGN";

    const target = await ensureMonthList(spaceId, parsed.data.month);
    const sectionId = await ensureSection(spaceId, target.id, "Imported", null, 0);

    let created = 0;
    for (let i = 0; i < legacy.length; i++) {
      const b = legacy[i];
      const exists = await prisma.budgetItem.findFirst({
        where: { sectionId, spaceId, label: b.category },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.budgetItem.create({
        data: {
          spaceId,
          listId: target.id,
          sectionId,
          label: b.category,
          amount: b.amount,
          currency: baseCurrency,
          category: b.category,
          sortOrder: i,
        },
      });
      created++;
    }

    revalidatePath("/finance/budget");
    return actionSuccess({ created }, "Legacy budget imported");
  } catch (error) {
    console.error("Error importing legacy budget:", error);
    return actionError("Failed to import legacy budget");
  }
}
