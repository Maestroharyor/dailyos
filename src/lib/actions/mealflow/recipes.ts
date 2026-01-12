"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createRecipeSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["breakfast", "lunch", "dinner", "snack", "dessert", "other"]),
  cookTime: z.number().int().positive(),
  ingredients: z.array(z.string()).min(1),
  instructions: z.array(z.string()).min(1),
  image: z.string().url().optional().nullable(),
  source: z.enum(["local", "mealdb"]).default("local"),
  mealDbId: z.string().optional().nullable(),
});

const updateRecipeSchema = createRecipeSchema.partial();

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;

export async function createRecipe(spaceId: string, input: CreateRecipeInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const recipe = await prisma.recipe.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/mealflow/recipes");
    return { success: true, recipe };
  } catch (error) {
    console.error("Error creating recipe:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "This recipe from MealDB already exists" };
    }
    return { error: "Failed to create recipe" };
  }
}

export async function updateRecipe(
  spaceId: string,
  recipeId: string,
  input: UpdateRecipeInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const recipe = await prisma.recipe.update({
      where: { id: recipeId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/mealflow/recipes");
    revalidatePath(`/mealflow/recipes/${recipeId}`);
    return { success: true, recipe };
  } catch (error) {
    console.error("Error updating recipe:", error);
    return { error: "Failed to update recipe" };
  }
}

export async function deleteRecipe(spaceId: string, recipeId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.recipe.delete({
      where: { id: recipeId, spaceId },
    });

    revalidatePath("/mealflow/recipes");
    return { success: true };
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return { error: "Failed to delete recipe" };
  }
}

// Save recipe from MealDB
export async function saveFromMealDb(
  spaceId: string,
  mealDbRecipe: {
    mealDbId: string;
    name: string;
    category: string;
    image: string;
    ingredients: string[];
    instructions: string[];
  }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Map MealDB category to our category
    const categoryMap: Record<string, CreateRecipeInput["category"]> = {
      Breakfast: "breakfast",
      Starter: "snack",
      Side: "snack",
      Dessert: "dessert",
      default: "dinner",
    };

    const recipe = await prisma.recipe.create({
      data: {
        spaceId,
        name: mealDbRecipe.name,
        category: categoryMap[mealDbRecipe.category] || "dinner",
        cookTime: 30, // Default estimate
        ingredients: mealDbRecipe.ingredients,
        instructions: mealDbRecipe.instructions,
        image: mealDbRecipe.image,
        source: "mealdb",
        mealDbId: mealDbRecipe.mealDbId,
      },
    });

    revalidatePath("/mealflow/recipes");
    return { success: true, recipe };
  } catch (error) {
    console.error("Error saving from MealDB:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "This recipe is already saved" };
    }
    return { error: "Failed to save recipe" };
  }
}
