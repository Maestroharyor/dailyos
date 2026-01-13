"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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

export async function createCategory(spaceId: string, input: CreateCategoryInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, category };
  } catch (error) {
    console.error("Error creating category:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A category with this slug already exists" };
    }
    return { error: "Failed to create category" };
  }
}

export async function updateCategory(
  spaceId: string,
  categoryId: string,
  input: UpdateCategoryInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Prevent circular parent reference
    if (parsed.data.parentId === categoryId) {
      return { error: "Category cannot be its own parent" };
    }

    const category = await prisma.category.update({
      where: { id: categoryId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/products");
    revalidatePath("/commerce/settings");
    return { success: true, category };
  } catch (error) {
    console.error("Error updating category:", error);
    return { error: "Failed to update category" };
  }
}

export async function deleteCategory(spaceId: string, categoryId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if category has products
    const hasProducts = await prisma.product.findFirst({
      where: { categoryId },
    });

    if (hasProducts) {
      return { error: "Cannot delete category with existing products" };
    }

    // Check if category has children
    const hasChildren = await prisma.category.findFirst({
      where: { parentId: categoryId },
    });

    if (hasChildren) {
      return { error: "Cannot delete category with subcategories" };
    }

    await prisma.category.delete({
      where: { id: categoryId, spaceId },
    });

    revalidatePath("/commerce/products");
    revalidatePath("/commerce/settings");
    return { success: true };
  } catch (error) {
    console.error("Error deleting category:", error);
    return { error: "Failed to delete category" };
  }
}
