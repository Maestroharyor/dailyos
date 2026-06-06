"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
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

export type ListMealsFilters = {
  startDate?: string;
  endDate?: string;
};

export async function listMeals(spaceId: string, filters?: ListMealsFilters) {
  const authResult = await authorizeAction(spaceId, "view_meals");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const startDate = filters?.startDate ?? null;
    const endDate = filters?.endDate ?? null;

    // Default to current week if no dates specified
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const start = startDate ? new Date(startDate) : weekStart;
    const end = endDate ? new Date(endDate) : weekEnd;

    const mealsRaw = await prisma.meal.findMany({
      where: {
        spaceId,
        date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        recipe: {
          select: {
            id: true,
            name: true,
            image: true,
            cookTime: true,
            category: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { type: "asc" }],
    });

    const meals = mealsRaw.map((meal) => ({
      ...meal,
      date: meal.date.toISOString(),
      createdAt: meal.createdAt.toISOString(),
      updatedAt: meal.updatedAt.toISOString(),
    }));

    // Group meals by date
    const mealsByDate: Record<string, typeof meals> = {};
    meals.forEach((meal) => {
      const dateKey = new Date(meal.date).toISOString().split("T")[0];
      if (!mealsByDate[dateKey]) {
        mealsByDate[dateKey] = [];
      }
      mealsByDate[dateKey].push(meal);
    });

    return actionSuccess(
      {
        meals,
        mealsByDate,
        dateRange: {
          start: start.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
        },
      },
      "Meals fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching meals:", error);
    return actionError("Failed to fetch meals");
  }
}

export async function createMeal(spaceId: string, input: CreateMealInput) {
  const authResult = await authorizeAction(spaceId, "edit_meals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createMealSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
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
    return actionSuccess(meal, "Meal created");
  } catch (error) {
    console.error("Error creating meal:", error);
    return actionError("Failed to create meal");
  }
}

export async function updateMeal(
  spaceId: string,
  mealId: string,
  input: UpdateMealInput
) {
  const authResult = await authorizeAction(spaceId, "edit_meals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateMealSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
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
    return actionSuccess(meal, "Meal updated");
  } catch (error) {
    console.error("Error updating meal:", error);
    return actionError("Failed to update meal");
  }
}

export async function deleteMeal(spaceId: string, mealId: string) {
  const authResult = await authorizeAction(spaceId, "edit_meals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.meal.delete({
      where: { id: mealId, spaceId },
    });

    revalidatePath("/mealflow/meals");
    return actionSuccess(null, "Meal deleted");
  } catch (error) {
    console.error("Error deleting meal:", error);
    return actionError("Failed to delete meal");
  }
}

// Quick add meal from recipe
export async function addMealFromRecipe(
  spaceId: string,
  recipeId: string,
  date: string,
  type: CreateMealInput["type"]
) {
  const authResult = await authorizeAction(spaceId, "edit_meals");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const recipe = await prisma.recipe.findFirst({
      where: { id: recipeId, spaceId },
    });

    if (!recipe) {
      return actionError("Recipe not found");
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
    return actionSuccess(meal, "Meal added");
  } catch (error) {
    console.error("Error adding meal from recipe:", error);
    return actionError("Failed to add meal");
  }
}
