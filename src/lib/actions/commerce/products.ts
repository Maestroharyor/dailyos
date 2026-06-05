"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { ensureUniqueProductSlug } from "@/lib/utils/slug";
import { z } from "zod";

/**
 * Translate Prisma's unique-constraint violation into a user-facing message
 * that names the right column. Returns null when the error isn't a unique
 * violation. Handles both shapes Prisma uses for `meta.target`:
 *   - string[] of field names (typical for composite uniques)
 *   - string (constraint name like "products_spaceId_slug_key")
 * Falls back to a neutral message rather than guessing SKU when we can't
 * identify the field.
 */
function uniqueConstraintMessage(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target;
    const fields: string[] = Array.isArray(target)
      ? target
      : typeof target === "string"
        ? target.split("_") // e.g. "products_spaceId_slug_key" → [products, spaceId, slug, key]
        : [];
    if (fields.includes("slug")) return "A product with this URL slug already exists";
    if (fields.includes("sku")) return "A product with this SKU already exists";
    return "A product with that value already exists";
  }
  // Legacy raw-string fallback if the error didn't surface as a structured Prisma error.
  if (err instanceof Error && err.message.includes("Unique constraint")) {
    const msg = err.message.toLowerCase();
    if (msg.includes("slug")) return "A product with this URL slug already exists";
    if (msg.includes("sku")) return "A product with this SKU already exists";
    return "A product with that value already exists";
  }
  return null;
}

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
  slug: z.string().optional(),
  description: z.string().optional(),
  price: z.number().positive(),
  costPrice: z.number().nonnegative(),
  salePrice: z.number().positive().optional().nullable(),
  onSale: z.boolean().default(false),
  categoryId: z.string().optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  isPublished: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  images: z.array(productImageSchema).default([]),
  variants: z.array(productVariantSchema).default([]),
  initialStock: z.number().int().nonnegative().optional(),
});

const updateProductSchema = createProductSchema.partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Helper to serialize Prisma Decimal fields to numbers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProduct(product: any) {
  return {
    ...product,
    price: Number(product.price),
    costPrice: Number(product.costPrice),
    salePrice: product.salePrice ? Number(product.salePrice) : null,
    variants: product.variants?.map((v: { price: unknown; costPrice: unknown }) => ({
      ...v,
      price: Number(v.price),
      costPrice: Number(v.costPrice),
    })),
  };
}

export async function createProduct(spaceId: string, input: CreateProductInput) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const { images, variants, initialStock, slug: slugInput, ...productData } = parsed.data;
    const slug = await ensureUniqueProductSlug(spaceId, slugInput || productData.name);

    const product = await prisma.product.create({
      data: {
        spaceId,
        ...productData,
        slug,
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
    const inventoryItemsData = [];
    if (product.variants.length > 0) {
      for (const variant of product.variants) {
        inventoryItemsData.push({
          spaceId,
          productId: product.id,
          variantId: variant.id,
          location: "default",
        });
      }
    } else {
      inventoryItemsData.push({
        spaceId,
        productId: product.id,
        location: "default",
      });
    }

    await prisma.inventoryItem.createMany({ data: inventoryItemsData });

    // Add initial stock if specified
    if (initialStock && initialStock > 0) {
      // Get the created inventory items
      const createdItems = await prisma.inventoryItem.findMany({
        where: { productId: product.id, spaceId },
      });

      // Create stock movements for initial stock
      const movements = createdItems.map((item) => ({
        inventoryItemId: item.id,
        type: "stock_in" as const,
        quantity: initialStock,
        costAtTime: productData.costPrice,
        notes: "Initial stock from product creation",
        referenceType: "purchase" as const,
      }));

      await prisma.inventoryMovement.createMany({ data: movements });
    }

    revalidatePath("/commerce/products");
    return actionSuccess(serializeProduct(product), "Product created");
  } catch (error) {
    console.error("Error creating product:", error);
    const uniqueMsg = uniqueConstraintMessage(error);
    if (uniqueMsg) return actionError(uniqueMsg);
    return actionError("Failed to create product");
  }
}

export async function updateProduct(
  spaceId: string,
  productId: string,
  input: UpdateProductInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const { images, variants, slug: slugInput, ...productData } = parsed.data;

    // Only regenerate slug if the caller explicitly supplied a `slug` field.
    // Renaming a product without touching the slug keeps the storefront URL
    // stable. If the caller submits an empty/whitespace slug, treat it as
    // "regenerate from name" — fall back to the product's current name when
    // the partial update doesn't include `name`. Reject the update if neither
    // source yields a usable name rather than silently producing `item-N`.
    let slug: string | undefined;
    if (slugInput !== undefined) {
      let baseName = (slugInput.trim() || productData.name || "").trim();
      if (!baseName) {
        const current = await prisma.product.findUnique({
          where: { id: productId },
          select: { name: true },
        });
        baseName = (current?.name ?? "").trim();
      }
      if (!baseName) {
        return actionError("Cannot derive slug: product has no name and no slug was provided");
      }
      slug = await ensureUniqueProductSlug(spaceId, baseName, productId);
    }

    const product = await prisma.product.update({
      where: { id: productId, spaceId },
      data: {
        ...productData,
        ...(slug !== undefined ? { slug } : {}),
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
    return actionSuccess(serializeProduct(product), "Product updated");
  } catch (error) {
    console.error("Error updating product:", error);
    const uniqueMsg = uniqueConstraintMessage(error);
    if (uniqueMsg) return actionError(uniqueMsg);
    return actionError("Failed to update product");
  }
}

export async function deleteProduct(spaceId: string, productId: string) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
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
      return actionSuccess({ archived: true }, "Product archived");
    }

    await prisma.product.delete({
      where: { id: productId, spaceId },
    });

    revalidatePath("/commerce/products");
    return actionSuccess(null, "Product deleted");
  } catch (error) {
    console.error("Error deleting product:", error);
    return actionError("Failed to delete product");
  }
}

export async function toggleProductPublished(
  spaceId: string,
  productId: string,
  isPublished: boolean
) {
  const authResult = await authorizeAction(spaceId, "publish_storefront");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const product = await prisma.product.update({
      where: { id: productId, spaceId },
      data: { isPublished },
    });

    revalidatePath("/commerce/products");
    return actionSuccess(serializeProduct(product), "Product updated");
  } catch (error) {
    console.error("Error toggling product published:", error);
    return actionError("Failed to update product");
  }
}
