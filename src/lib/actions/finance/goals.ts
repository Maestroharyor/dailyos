"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createGoalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  currentAmount: z.number().nonnegative().default(0),
  deadline: z.string(), // ISO date string
  description: z.string().optional().nullable(),
});

const updateGoalSchema = createGoalSchema.partial();

const contributeSchema = z.object({
  amount: z.number().positive(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export async function listGoals(
  spaceId: string,
  filters?: { status?: string }
) {
  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const status = filters?.status; // all, active, completed

    const goals = await prisma.goal.findMany({
      where: { spaceId },
      orderBy: { deadline: "asc" },
    });

    // Calculate progress for each goal
    const goalsWithProgress = goals.map((goal) => {
      const progress = Number(goal.targetAmount) > 0
        ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
        : 0;
      const isCompleted = progress >= 100;
      const daysRemaining = Math.ceil(
        (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      return {
        ...goal,
        targetAmount: Number(goal.targetAmount),
        currentAmount: Number(goal.currentAmount),
        deadline: goal.deadline.toISOString(),
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
        progress: Math.min(progress, 100),
        isCompleted,
        daysRemaining: Math.max(daysRemaining, 0),
        isOverdue: daysRemaining < 0 && !isCompleted,
      };
    });

    // Filter by status if specified
    const filteredGoals =
      status === "active"
        ? goalsWithProgress.filter((g) => !g.isCompleted)
        : status === "completed"
        ? goalsWithProgress.filter((g) => g.isCompleted)
        : goalsWithProgress;

    // Calculate totals
    const totalTarget = goals.reduce((sum, g) => sum + Number(g.targetAmount), 0);
    const totalCurrent = goals.reduce(
      (sum, g) => sum + Number(g.currentAmount),
      0
    );

    return actionSuccess(
      {
        goals: filteredGoals,
        totals: {
          target: totalTarget,
          current: totalCurrent,
          remaining: totalTarget - totalCurrent,
          completedCount: goalsWithProgress.filter((g) => g.isCompleted).length,
          activeCount: goalsWithProgress.filter((g) => !g.isCompleted).length,
        },
      },
      "Goals fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching goals:", error);
    return actionError("Failed to fetch goals");
  }
}

export async function createGoal(spaceId: string, input: CreateGoalInput) {
  const authResult = await authorizeAction(spaceId, "manage_goals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const goal = await prisma.goal.create({
      data: {
        spaceId,
        ...parsed.data,
        deadline: new Date(parsed.data.deadline),
      },
    });

    revalidatePath("/finance/goals");
    return actionSuccess(goal, "Goal created");
  } catch (error) {
    console.error("Error creating goal:", error);
    return actionError("Failed to create goal");
  }
}

export async function updateGoal(
  spaceId: string,
  goalId: string,
  input: UpdateGoalInput
) {
  const authResult = await authorizeAction(spaceId, "manage_goals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateGoalSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const updateData = {
      ...parsed.data,
      ...(parsed.data.deadline && { deadline: new Date(parsed.data.deadline) }),
    };

    const goal = await prisma.goal.update({
      where: { id: goalId, spaceId },
      data: updateData,
    });

    revalidatePath("/finance/goals");
    return actionSuccess(goal, "Goal updated");
  } catch (error) {
    console.error("Error updating goal:", error);
    return actionError("Failed to update goal");
  }
}

export async function deleteGoal(spaceId: string, goalId: string) {
  const authResult = await authorizeAction(spaceId, "manage_goals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.goal.delete({
      where: { id: goalId, spaceId },
    });

    revalidatePath("/finance/goals");
    return actionSuccess(null, "Goal deleted");
  } catch (error) {
    console.error("Error deleting goal:", error);
    return actionError("Failed to delete goal");
  }
}

export async function contributeToGoal(
  spaceId: string,
  goalId: string,
  amount: number
) {
  const authResult = await authorizeAction(spaceId, "manage_goals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = contributeSchema.safeParse({ amount });
  if (!parsed.success) {
    return actionError("Invalid amount");
  }

  try {
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, spaceId },
    });

    if (!goal) {
      return actionError("Goal not found");
    }

    const updatedGoal = await prisma.goal.update({
      where: { id: goalId, spaceId },
      data: {
        currentAmount: {
          increment: parsed.data.amount,
        },
      },
    });

    revalidatePath("/finance/goals");
    return actionSuccess(updatedGoal, "Contribution added");
  } catch (error) {
    console.error("Error contributing to goal:", error);
    return actionError("Failed to contribute to goal");
  }
}
