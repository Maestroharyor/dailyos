"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

const updateCategorySchema = createCategorySchema.partial();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export async function listCategories(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const categories = await prisma.category.findMany({
      where: { spaceId },
      include: {
        _count: {
          select: { products: true },
        },
        children: {
          include: {
            _count: { select: { products: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Build tree structure
    const rootCategories = categories.filter((c) => !c.parentId);
    const categoryTree = rootCategories.map((category) => ({
      ...category,
      children: categories.filter((c) => c.parentId === category.id),
    }));

    return actionSuccess(
      {
        categories: categoryTree,
        flatCategories: categories,
      },
      "Categories fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return actionError("Failed to fetch categories");
  }
}

export async function createCategory(spaceId: string, input: CreateCategoryInput) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const category = await prisma.category.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/products");
    revalidatePath("/commerce/settings");
    return actionSuccess(category, "Category created");
  } catch (error) {
    console.error("Error creating category:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("A category with this slug already exists");
    }
    return actionError("Failed to create category");
  }
}

export async function updateCategory(
  spaceId: string,
  categoryId: string,
  input: UpdateCategoryInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Prevent circular parent reference
    if (parsed.data.parentId === categoryId) {
      return actionError("Category cannot be its own parent");
    }

    const category = await prisma.category.update({
      where: { id: categoryId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/products");
    revalidatePath("/commerce/settings");
    return actionSuccess(category, "Category updated");
  } catch (error) {
    console.error("Error updating category:", error);
    return actionError("Failed to update category");
  }
}

export async function deleteCategory(spaceId: string, categoryId: string) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Check if category has products
    const hasProducts = await prisma.product.findFirst({
      where: { categoryId },
    });

    if (hasProducts) {
      return actionError("Cannot delete category with existing products");
    }

    // Check if category has children
    const hasChildren = await prisma.category.findFirst({
      where: { parentId: categoryId },
    });

    if (hasChildren) {
      return actionError("Cannot delete category with subcategories");
    }

    await prisma.category.delete({
      where: { id: categoryId, spaceId },
    });

    revalidatePath("/commerce/products");
    revalidatePath("/commerce/settings");
    return actionSuccess(null, "Category deleted");
  } catch (error) {
    console.error("Error deleting category:", error);
    return actionError("Failed to delete category");
  }
}
