"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { materializeRecurring } from "./recurring";

export interface ListTransactionsFilters {
  type?: string;
  category?: string;
  month?: string;
  recurring?: boolean;
  page?: number;
  limit?: number;
}

export async function listTransactions(
  spaceId: string,
  filters: ListTransactionsFilters = {}
) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const { type, category, month, recurring } = filters;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    // On-read catch-up: generate any due recurring instances before listing.
    // Idempotent and gated to the first page so it runs once per fresh load.
    if (page === 1) {
      await materializeRecurring(spaceId);
    }

    // Build date range for month filter
    let dateFilter: Prisma.TransactionWhereInput = {};
    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);
      dateFilter = {
        date: {
          gte: startDate,
          lte: endDate,
        },
      };
    }

    // Build where clause. When `recurring` is set, list templates only
    // (recurring=true, recurringTemplateId=null) for the recurring page.
    const where: Prisma.TransactionWhereInput = {
      spaceId,
      ...dateFilter,
      ...(type && type !== "all" && { type: type as Prisma.EnumTransactionTypeFilter }),
      ...(category && category !== "all" && { category }),
      ...(recurring && { recurring: true, recurringTemplateId: null }),
    };

    // Execute queries in parallel
    const [transactions, total, stats] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({
        by: ["type"],
        where: { spaceId, ...dateFilter },
        _sum: { amount: true },
      }),
    ]);

    // Calculate totals
    const income = stats.find((s) => s.type === "income")?._sum.amount ?? 0;
    const expense = stats.find((s) => s.type === "expense")?._sum.amount ?? 0;

    const serializedTransactions = transactions.map((t) => ({
      id: t.id,
      spaceId: t.spaceId,
      type: t.type,
      amount: Number(t.amount),
      category: t.category,
      description: t.description,
      date: t.date.toISOString(),
      tags: t.tags,
      recurring: t.recurring,
      recurrenceType: t.recurrenceType,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return actionSuccess(
      {
        transactions: serializedTransactions,
        stats: {
          income: Number(income),
          expense: Number(expense),
          balance: Number(income) - Number(expense),
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Transactions fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return actionError("Failed to fetch transactions");
  }
}

// Validation schemas
const createTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  date: z.string(), // ISO date string
  tags: z.array(z.string()).default([]),
  recurring: z.boolean().default(false),
  recurrenceType: z.enum(["weekly", "monthly", "yearly"]).optional().nullable(),
});

const updateTransactionSchema = createTransactionSchema.partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

/**
 * Persist a custom category to FinanceSettings so a value typed into the
 * expense/income/recurring form survives in future dropdowns. Mirrors the
 * novel-category handling in `createBudgets`. No-op when the category already
 * exists or settings haven't been initialized.
 */
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

export async function createTransaction(
  spaceId: string,
  input: CreateTransactionInput
) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const transaction = await prisma.transaction.create({
      data: {
        spaceId,
        ...parsed.data,
        date: new Date(parsed.data.date),
      },
    });

    await ensureCategory(spaceId, parsed.data.category);

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(transaction, "Transaction created");
  } catch (error) {
    console.error("Error creating transaction:", error);
    return actionError("Failed to create transaction");
  }
}

export async function updateTransaction(
  spaceId: string,
  transactionId: string,
  input: UpdateTransactionInput
) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const updateData = {
      ...parsed.data,
      ...(parsed.data.date && { date: new Date(parsed.data.date) }),
    };

    const transaction = await prisma.transaction.update({
      where: { id: transactionId, spaceId },
      data: updateData,
    });

    await ensureCategory(spaceId, parsed.data.category);

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(transaction, "Transaction updated");
  } catch (error) {
    console.error("Error updating transaction:", error);
    return actionError("Failed to update transaction");
  }
}

export async function deleteTransaction(spaceId: string, transactionId: string) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.transaction.delete({
      where: { id: transactionId, spaceId },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(null, "Transaction deleted");
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return actionError("Failed to delete transaction");
  }
}
