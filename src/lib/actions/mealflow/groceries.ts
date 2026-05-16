"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createGrocerySchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  category: z.string().min(1),
  price: z.number().nonnegative().optional().nullable(),
});

const updateGrocerySchema = createGrocerySchema.partial().extend({
  checked: z.boolean().optional(),
});

export type CreateGroceryInput = z.infer<typeof createGrocerySchema>;
export type UpdateGroceryInput = z.infer<typeof updateGrocerySchema>;

export async function createGroceryItem(
  spaceId: string,
  input: CreateGroceryInput
) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createGrocerySchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const item = await prisma.groceryItem.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/mealflow/groceries");
    return actionSuccess(item, "Item created");
  } catch (error) {
    console.error("Error creating grocery item:", error);
    return actionError("Failed to create grocery item");
  }
}

export async function updateGroceryItem(
  spaceId: string,
  itemId: string,
  input: UpdateGroceryInput
) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateGrocerySchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const item = await prisma.groceryItem.update({
      where: { id: itemId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/mealflow/groceries");
    return actionSuccess(item, "Item updated");
  } catch (error) {
    console.error("Error updating grocery item:", error);
    return actionError("Failed to update grocery item");
  }
}

export async function deleteGroceryItem(spaceId: string, itemId: string) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.groceryItem.delete({
      where: { id: itemId, spaceId },
    });

    revalidatePath("/mealflow/groceries");
    return actionSuccess(null, "Item deleted");
  } catch (error) {
    console.error("Error deleting grocery item:", error);
    return actionError("Failed to delete grocery item");
  }
}

export async function toggleGroceryChecked(
  spaceId: string,
  itemId: string,
  checked: boolean
) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const item = await prisma.groceryItem.update({
      where: { id: itemId, spaceId },
      data: { checked },
    });

    revalidatePath("/mealflow/groceries");
    return actionSuccess(item, "Item toggled");
  } catch (error) {
    console.error("Error toggling grocery item:", error);
    return actionError("Failed to update grocery item");
  }
}

export async function clearCheckedItems(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const result = await prisma.groceryItem.deleteMany({
      where: { spaceId, checked: true },
    });

    revalidatePath("/mealflow/groceries");
    return actionSuccess({ deleted: result.count }, "Checked items cleared");
  } catch (error) {
    console.error("Error clearing checked items:", error);
    return actionError("Failed to clear checked items");
  }
}

// Add ingredients from recipe to grocery list
export async function addIngredientsFromRecipe(
  spaceId: string,
  recipeId: string
) {
  const authResult = await authorizeAction(spaceId, "manage_groceries");
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

    // Parse ingredients and create grocery items
    const items = recipe.ingredients.map((ingredient) => ({
      spaceId,
      name: ingredient,
      quantity: 1,
      unit: "item",
      category: "Recipe Items",
    }));

    await prisma.groceryItem.createMany({ data: items });

    revalidatePath("/mealflow/groceries");
    return actionSuccess({ added: items.length }, "Ingredients added");
  } catch (error) {
    console.error("Error adding ingredients:", error);
    return actionError("Failed to add ingredients");
  }
}
