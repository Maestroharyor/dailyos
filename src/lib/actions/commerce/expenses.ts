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
  receiptUrl: z.string().url().optional().nullable(),
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
