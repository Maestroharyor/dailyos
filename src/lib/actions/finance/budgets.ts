"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const budget = await prisma.budget.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/finance/budget");
    return { success: true, budget };
  } catch (error) {
    console.error("Error creating budget:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "Budget for this category and month already exists" };
    }
    return { error: "Failed to create budget" };
  }
}

export async function updateBudget(
  spaceId: string,
  budgetId: string,
  input: UpdateBudgetInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const budget = await prisma.budget.update({
      where: { id: budgetId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/finance/budget");
    return { success: true, budget };
  } catch (error) {
    console.error("Error updating budget:", error);
    return { error: "Failed to update budget" };
  }
}

export async function deleteBudget(spaceId: string, budgetId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.budget.delete({
      where: { id: budgetId, spaceId },
    });

    revalidatePath("/finance/budget");
    return { success: true };
  } catch (error) {
    console.error("Error deleting budget:", error);
    return { error: "Failed to delete budget" };
  }
}

// Copy budgets from previous month
export async function copyBudgetsFromMonth(
  spaceId: string,
  fromMonth: string,
  toMonth: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const sourceBudgets = await prisma.budget.findMany({
      where: { spaceId, month: fromMonth },
    });

    if (sourceBudgets.length === 0) {
      return { error: "No budgets found in source month" };
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
    return { success: true, created };
  } catch (error) {
    console.error("Error copying budgets:", error);
    return { error: "Failed to copy budgets" };
  }
}
