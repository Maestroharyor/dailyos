"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  isPrimary: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

const productVariantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  costPrice: z.number().nonnegative(),
  attributes: z.record(z.string(), z.string()).default({}),
});

const createProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().nonnegative(),
  categoryId: z.string().optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  isPublished: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  images: z.array(productImageSchema).default([]),
  variants: z.array(productVariantSchema).default([]),
});

const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export async function createProduct(spaceId: string, input: CreateProductInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const { images, variants, ...productData } = parsed.data;

    const product = await prisma.product.create({
      data: {
        spaceId,
        ...productData,
        images: {
          create: images,
        },
        variants: {
          create: variants,
        },
      },
      include: {
        images: true,
        variants: true,
        category: true,
      },
    });

    // Create inventory items for product and variants
    const inventoryItems = [];
    if (product.variants.length > 0) {
      for (const variant of product.variants) {
        inventoryItems.push({
          spaceId,
          productId: product.id,
          variantId: variant.id,
          location: "default",
        });
      }
    } else {
      inventoryItems.push({
        spaceId,
        productId: product.id,
        location: "default",
      });
    }

    await prisma.inventoryItem.createMany({ data: inventoryItems });

    revalidatePath("/commerce/products");
    return { success: true, product };
  } catch (error) {
    console.error("Error creating product:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A product with this SKU already exists" };
    }
    return { error: "Failed to create product" };
  }
}

export async function updateProduct(
  spaceId: string,
  productId: string,
  input: UpdateProductInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const { images, variants, ...productData } = parsed.data;

    const product = await prisma.product.update({
      where: { id: productId, spaceId },
      data: {
        ...productData,
        ...(images && {
          images: {
            deleteMany: {},
            create: images,
          },
        }),
        ...(variants && {
          variants: {
            deleteMany: {},
            create: variants,
          },
        }),
      },
      include: {
        images: true,
        variants: true,
        category: true,
      },
    });

    revalidatePath("/commerce/products");
    revalidatePath(`/commerce/products/${productId}`);
    return { success: true, product };
  } catch (error) {
    console.error("Error updating product:", error);
    return { error: "Failed to update product" };
  }
}

export async function deleteProduct(spaceId: string, productId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if product has orders
    const hasOrders = await prisma.orderItem.findFirst({
      where: { productId },
    });

    if (hasOrders) {
      // Archive instead of delete
      await prisma.product.update({
        where: { id: productId, spaceId },
        data: { status: "archived", isPublished: false },
      });
      revalidatePath("/commerce/products");
      return { success: true, archived: true };
    }

    await prisma.product.delete({
      where: { id: productId, spaceId },
    });

    revalidatePath("/commerce/products");
    return { success: true };
  } catch (error) {
    console.error("Error deleting product:", error);
    return { error: "Failed to delete product" };
  }
}

export async function toggleProductPublished(
  spaceId: string,
  productId: string,
  isPublished: boolean
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const product = await prisma.product.update({
      where: { id: productId, spaceId },
      data: { isPublished },
    });

    revalidatePath("/commerce/products");
    return { success: true, product };
  } catch (error) {
    console.error("Error toggling product published:", error);
    return { error: "Failed to update product" };
  }
}
