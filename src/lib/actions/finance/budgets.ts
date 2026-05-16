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
