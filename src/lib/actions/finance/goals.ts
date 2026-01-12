"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, goal };
  } catch (error) {
    console.error("Error creating goal:", error);
    return { error: "Failed to create goal" };
  }
}

export async function updateGoal(
  spaceId: string,
  goalId: string,
  input: UpdateGoalInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateGoalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, goal };
  } catch (error) {
    console.error("Error updating goal:", error);
    return { error: "Failed to update goal" };
  }
}

export async function deleteGoal(spaceId: string, goalId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.goal.delete({
      where: { id: goalId, spaceId },
    });

    revalidatePath("/finance/goals");
    return { success: true };
  } catch (error) {
    console.error("Error deleting goal:", error);
    return { error: "Failed to delete goal" };
  }
}

export async function contributeToGoal(
  spaceId: string,
  goalId: string,
  amount: number
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = contributeSchema.safeParse({ amount });
  if (!parsed.success) {
    return { error: "Invalid amount" };
  }

  try {
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, spaceId },
    });

    if (!goal) {
      return { error: "Goal not found" };
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
    return { success: true, goal: updatedGoal };
  } catch (error) {
    console.error("Error contributing to goal:", error);
    return { error: "Failed to contribute to goal" };
  }
}
