"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  receiptUrl: z.string().url().optional().nullable(),
  date: z.string(),
  isRecurring: z.boolean().default(false),
});

const updateExpenseSchema = createExpenseSchema.partial();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export async function createExpense(spaceId: string, input: CreateExpenseInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, expense };
  } catch (error) {
    console.error("Error creating expense:", error);
    return { error: "Failed to create expense" };
  }
}

export async function updateExpense(
  spaceId: string,
  expenseId: string,
  input: UpdateExpenseInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, expense };
  } catch (error) {
    console.error("Error updating expense:", error);
    return { error: "Failed to update expense" };
  }
}

export async function deleteExpense(spaceId: string, expenseId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.expense.delete({
      where: { id: expenseId, spaceId },
    });

    revalidatePath("/commerce/expenses");
    return { success: true };
  } catch (error) {
    console.error("Error deleting expense:", error);
    return { error: "Failed to delete expense" };
  }
}

// Get expense summary by category for a date range
export async function getExpenseSummary(
  spaceId: string,
  startDate: string,
  endDate: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
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

    return {
      success: true,
      byCategory: expenses.map((e) => ({
        category: e.category,
        amount: Number(e._sum.amount) || 0,
        count: e._count,
      })),
      total: Number(total._sum.amount) || 0,
    };
  } catch (error) {
    console.error("Error getting expense summary:", error);
    return { error: "Failed to get expense summary" };
  }
}

// Get expenses for profit calculation
export async function getExpensesForPeriod(
  spaceId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const expenses = await prisma.expense.findMany({
      where: {
        spaceId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "desc" },
    });

    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return { expenses, total };
  } catch (error) {
    console.error("Error getting expenses:", error);
    return { expenses: [], total: 0 };
  }
}
