"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createMealSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  date: z.string(), // ISO date string
  notes: z.string().optional().nullable(),
  recipeId: z.string().optional().nullable(),
});

const updateMealSchema = createMealSchema.partial();

export type CreateMealInput = z.infer<typeof createMealSchema>;
export type UpdateMealInput = z.infer<typeof updateMealSchema>;

export async function createMeal(spaceId: string, input: CreateMealInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createMealSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const meal = await prisma.meal.create({
      data: {
        spaceId,
        ...parsed.data,
        date: new Date(parsed.data.date),
      },
      include: {
        recipe: {
          select: { id: true, name: true, image: true, cookTime: true },
        },
      },
    });

    revalidatePath("/mealflow/meals");
    return { success: true, meal };
  } catch (error) {
    console.error("Error creating meal:", error);
    return { error: "Failed to create meal" };
  }
}

export async function updateMeal(
  spaceId: string,
  mealId: string,
  input: UpdateMealInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateMealSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const updateData = {
      ...parsed.data,
      ...(parsed.data.date && { date: new Date(parsed.data.date) }),
    };

    const meal = await prisma.meal.update({
      where: { id: mealId, spaceId },
      data: updateData,
      include: {
        recipe: {
          select: { id: true, name: true, image: true, cookTime: true },
        },
      },
    });

    revalidatePath("/mealflow/meals");
    return { success: true, meal };
  } catch (error) {
    console.error("Error updating meal:", error);
    return { error: "Failed to update meal" };
  }
}

export async function deleteMeal(spaceId: string, mealId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.meal.delete({
      where: { id: mealId, spaceId },
    });

    revalidatePath("/mealflow/meals");
    return { success: true };
  } catch (error) {
    console.error("Error deleting meal:", error);
    return { error: "Failed to delete meal" };
  }
}

// Quick add meal from recipe
export async function addMealFromRecipe(
  spaceId: string,
  recipeId: string,
  date: string,
  type: CreateMealInput["type"]
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId },
    });

    if (!recipe) {
      return { error: "Recipe not found" };
    }

    const meal = await prisma.meal.create({
      data: {
        spaceId,
        name: recipe.name,
        type,
        date: new Date(date),
        recipeId,
      },
      include: {
        recipe: {
          select: { id: true, name: true, image: true, cookTime: true },
        },
      },
    });

    revalidatePath("/mealflow/meals");
    return { success: true, meal };
  } catch (error) {
    console.error("Error adding meal from recipe:", error);
    return { error: "Failed to add meal" };
  }
}
