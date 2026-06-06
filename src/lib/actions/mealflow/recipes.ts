"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
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

export interface RecipeFilters {
  search?: string;
  category?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export async function listRecipes(spaceId: string, filters: RecipeFilters = {}) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_recipes");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const category = filters.category;
    const source = filters.source;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 12;

    // Build where clause
    const where: Prisma.RecipeWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { ingredients: { hasSome: [search] } },
        ],
      }),
      ...(category && category !== "all" && { category: category as Prisma.EnumRecipeCategoryFilter }),
      ...(source && source !== "all" && { source: source as Prisma.EnumRecipeSourceFilter }),
    };

    // Execute queries in parallel
    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recipe.count({ where }),
    ]);

    return actionSuccess(
      {
        recipes,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Recipes fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching recipes:", error);
    return actionError("Failed to fetch recipes");
  }
}

export async function createRecipe(spaceId: string, input: CreateRecipeInput) {
  const authResult = await authorizeAction(spaceId, "edit_recipes");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const recipe = await prisma.recipe.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/mealflow/recipes");
    return actionSuccess(recipe, "Recipe created");
  } catch (error) {
    console.error("Error creating recipe:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("This recipe from MealDB already exists");
    }
    return actionError("Failed to create recipe");
  }
}

export async function updateRecipe(
  spaceId: string,
  recipeId: string,
  input: UpdateRecipeInput
) {
  const authResult = await authorizeAction(spaceId, "edit_recipes");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const recipe = await prisma.recipe.update({
      where: { id: recipeId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/mealflow/recipes");
    revalidatePath(`/mealflow/recipes/${recipeId}`);
    return actionSuccess(recipe, "Recipe updated");
  } catch (error) {
    console.error("Error updating recipe:", error);
    return actionError("Failed to update recipe");
  }
}

export async function deleteRecipe(spaceId: string, recipeId: string) {
  const authResult = await authorizeAction(spaceId, "edit_recipes");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.recipe.delete({
      where: { id: recipeId, spaceId },
    });

    revalidatePath("/mealflow/recipes");
    return actionSuccess(null, "Recipe deleted");
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return actionError("Failed to delete recipe");
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
  const authResult = await authorizeAction(spaceId, "edit_recipes");
  if ("error" in authResult) {
    return actionError(authResult.error);
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
    return actionSuccess(recipe, "Recipe saved");
  } catch (error) {
    console.error("Error saving from MealDB:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("This recipe is already saved");
    }
    return actionError("Failed to save recipe");
  }
}
