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
