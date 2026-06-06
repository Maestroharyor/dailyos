"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
import { z } from "zod";
import type { ExpenseCategory } from "@prisma/client";

// Validation schemas
const createExpenseSchema = z.object({
  category: z.enum([
    "rent",
    "utilities",
    "salaries",
    "supplies",
    "marketing",
    "maintenance",
    "shipping",
    "taxes",
    "insurance",
    "other",
  ]),
  amount: z.number().positive("Amount must be greater than 0"),
  description: z.string().min(1, "Description is required"),
  vendor: z.string().optional().nullable(),
  // Stores a Supabase Storage object path (private receipts bucket), not a URL.
  receiptUrl: z.string().optional().nullable(),
  date: z.string(),
  isRecurring: z.boolean().default(false),
});

const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export async function createExpense(spaceId: string, input: CreateExpenseInput) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const expense = await prisma.expense.create({
      data: {
        spaceId,
        category: parsed.data.category as ExpenseCategory,
        amount: parsed.data.amount,
        description: parsed.data.description,
        vendor: parsed.data.vendor,
        receiptUrl: parsed.data.receiptUrl,
        date: new Date(parsed.data.date),
        isRecurring: parsed.data.isRecurring,
      },
    });

    revalidatePath("/commerce/expenses");
    return actionSuccess(expense, "Expense created");
  } catch (error) {
    console.error("Error creating expense:", error);
    return actionError("Failed to create expense");
  }
}

export async function updateExpense(
  spaceId: string,
  expenseId: string,
  input: UpdateExpenseInput
) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.date) {
      updateData.date = new Date(parsed.data.date);
    }

    const expense = await prisma.expense.update({
      where: { id: expenseId, spaceId },
      data: updateData,
    });

    revalidatePath("/commerce/expenses");
    revalidatePath(`/commerce/expenses/${expenseId}`);
    return actionSuccess(expense, "Expense updated");
  } catch (error) {
    console.error("Error updating expense:", error);
    return actionError("Failed to update expense");
  }
}

export async function deleteExpense(spaceId: string, expenseId: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.expense.delete({
      where: { id: expenseId, spaceId },
    });

    revalidatePath("/commerce/expenses");
    return actionSuccess(null, "Expense deleted");
  } catch (error) {
    console.error("Error deleting expense:", error);
    return actionError("Failed to delete expense");
  }
}

// List expenses with filters, totals, category breakdown, and pagination
export async function listExpenses(
  spaceId: string,
  filters: {
    category?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const authResult = await authorizeAction(spaceId, "view_reports");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const { category, startDate, endDate } = filters;
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));

    const where = {
      spaceId,
      ...(category && { category: category as never }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    };

    const [expenses, total, summary] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    // Get category breakdown
    const byCategory = await prisma.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      _count: true,
    });

    return actionSuccess(
      {
        expenses: expenses.map((e) => ({
          id: e.id,
          spaceId: e.spaceId,
          category: e.category,
          amount: Number(e.amount),
          description: e.description,
          vendor: e.vendor,
          receiptUrl: e.receiptUrl,
          date: e.date.toISOString(),
          isRecurring: e.isRecurring,
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        })),
        totalAmount: Number(summary._sum.amount) || 0,
        byCategory: byCategory.map((c) => ({
          category: c.category,
          amount: Number(c._sum.amount) || 0,
          count: c._count,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Expenses fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return actionError("Failed to fetch expenses");
  }
}

// Get expense summary by category for a date range
export async function getExpenseSummary(
  spaceId: string,
  startDate: string,
  endDate: string
) {
  const authResult = await authorizeAction(spaceId, "view_reports");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const expenses = await prisma.expense.groupBy({
      by: ["category"],
      where: {
        spaceId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _sum: {
        amount: true,
      },
      _count: true,
    });

    const total = await prisma.expense.aggregate({
      where: {
        spaceId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      _sum: {
        amount: true,
      },
    });

    return actionSuccess(
      {
        byCategory: expenses.map((e) => ({
          category: e.category,
          amount: Number(e._sum.amount) || 0,
          count: e._count,
        })),
        total: Number(total._sum.amount) || 0,
      },
      "Expense summary retrieved"
    );
  } catch (error) {
    console.error("Error getting expense summary:", error);
    return actionError("Failed to get expense summary");
  }
}
