"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createBudgetSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM format
});

const updateBudgetSchema = z.object({
  amount: z.number().positive(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export async function listBudgets(spaceId: string, month?: string) {
  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    // Default to current month if not specified
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    // Get budgets for the month
    const budgets = await prisma.budget.findMany({
      where: { spaceId, month: targetMonth },
      orderBy: { category: "asc" },
    });

    // Get actual spending for each category
    const [year, monthNum] = targetMonth.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const spending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        spaceId,
        type: "expense",
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    // Merge budgets with actual spending
    const budgetsWithSpending = budgets.map((budget) => {
      const spent = spending.find((s) => s.category === budget.category)?._sum
        .amount ?? 0;
      const amount = Number(budget.amount);
      const spentValue = Number(spent);
      return {
        id: budget.id,
        spaceId: budget.spaceId,
        category: budget.category,
        amount,
        month: budget.month,
        spent: spentValue,
        remaining: amount - spentValue,
        percentUsed: amount > 0 ? (spentValue / amount) * 100 : 0,
        createdAt: budget.createdAt.toISOString(),
        updatedAt: budget.updatedAt.toISOString(),
      };
    });

    // Calculate totals
    const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.spent, 0);

    return actionSuccess(
      {
        budgets: budgetsWithSpending,
        month: targetMonth,
        totals: {
          budget: totalBudget,
          spent: totalSpent,
          remaining: totalBudget - totalSpent,
        },
      },
      "Budgets fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return actionError("Failed to fetch budgets");
  }
}

export async function createBudget(spaceId: string, input: CreateBudgetInput) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const budget = await prisma.budget.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/finance/budget");
    return actionSuccess(budget, "Budget created");
  } catch (error) {
    console.error("Error creating budget:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("Budget for this category and month already exists");
    }
    return actionError("Failed to create budget");
  }
}

export async function updateBudget(
  spaceId: string,
  budgetId: string,
  input: UpdateBudgetInput
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const budget = await prisma.budget.update({
      where: { id: budgetId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/finance/budget");
    return actionSuccess(budget, "Budget updated");
  } catch (error) {
    console.error("Error updating budget:", error);
    return actionError("Failed to update budget");
  }
}

export async function deleteBudget(spaceId: string, budgetId: string) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.budget.delete({
      where: { id: budgetId, spaceId },
    });

    revalidatePath("/finance/budget");
    return actionSuccess(null, "Budget deleted");
  } catch (error) {
    console.error("Error deleting budget:", error);
    return actionError("Failed to delete budget");
  }
}

// Copy budgets from previous month
export async function copyBudgetsFromMonth(
  spaceId: string,
  fromMonth: string,
  toMonth: string
) {
  const authResult = await authorizeAction(spaceId, "manage_budget");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const sourceBudgets = await prisma.budget.findMany({
      where: { spaceId, month: fromMonth },
    });

    if (sourceBudgets.length === 0) {
      return actionError("No budgets found in source month");
    }

    // Create budgets for new month (skip existing)
    const results = await Promise.allSettled(
      sourceBudgets.map((budget) =>
        prisma.budget.create({
          data: {
            spaceId,
            category: budget.category,
            amount: budget.amount,
            month: toMonth,
          },
        })
      )
    );

    const created = results.filter((r) => r.status === "fulfilled").length;

    revalidatePath("/finance/budget");
    return actionSuccess({ created }, "Budgets copied");
  } catch (error) {
    console.error("Error copying budgets:", error);
    return actionError("Failed to copy budgets");
  }
}
