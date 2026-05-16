"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
import { z } from "zod";
import type { DiscountType } from "@prisma/client";

// Validation schemas
const createSaleEventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional().nullable(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.number().positive("Discount value must be greater than 0"),
  bannerImage: z.string().optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  isActive: z.boolean().default(true),
  products: z
    .array(
      z.object({
        productId: z.string(),
        salePrice: z.number().positive().optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

const updateSaleEventSchema = createSaleEventSchema
  .omit({ products: true })
  .partial();

export type CreateSaleEventInput = z.infer<typeof createSaleEventSchema>;
export type UpdateSaleEventInput = z.infer<typeof updateSaleEventSchema>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createSaleEvent(
  spaceId: string,
  input: CreateSaleEventInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createSaleEventSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  const data = parsed.data;

  // Validate percentage discounts
  if (data.discountType === "percentage" && data.discountValue > 100) {
    return actionError("Percentage discount cannot exceed 100%");
  }

  // Validate dates
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (endDate <= startDate) {
    return actionError("End date must be after start date");
  }

  try {
    const slug = slugify(data.slug || data.name);

    const saleEvent = await prisma.saleEvent.create({
      data: {
        spaceId,
        name: data.name,
        slug,
        description: data.description,
        discountType: data.discountType as DiscountType,
        discountValue: data.discountValue,
        bannerImage: data.bannerImage,
        startDate,
        endDate,
        isActive: data.isActive,
        ...(data.products.length > 0 && {
          products: {
            create: data.products.map((p) => ({
              productId: p.productId,
              salePrice: p.salePrice ?? undefined,
            })),
          },
        }),
      },
      include: {
        products: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, price: true },
            },
          },
        },
      },
    });

    revalidatePath("/commerce/sales");
    return actionSuccess(saleEvent, "Sale event created");
  } catch (error) {
    console.error("Error creating sale event:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("A sale event with this slug already exists");
    }
    return actionError("Failed to create sale event");
  }
}

export async function updateSaleEvent(
  spaceId: string,
  eventId: string,
  input: UpdateSaleEventInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateSaleEventSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  const data = parsed.data;

  if (data.discountType === "percentage" && data.discountValue && data.discountValue > 100) {
    return actionError("Percentage discount cannot exceed 100%");
  }

  try {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = slugify(data.slug);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.discountType !== undefined) updateData.discountType = data.discountType;
    if (data.discountValue !== undefined) updateData.discountValue = data.discountValue;
    if (data.bannerImage !== undefined) updateData.bannerImage = data.bannerImage;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const saleEvent = await prisma.saleEvent.update({
      where: { id: eventId, spaceId },
      data: updateData,
    });

    revalidatePath("/commerce/sales");
    revalidatePath(`/commerce/sales/${eventId}`);
    return actionSuccess(saleEvent, "Sale event updated");
  } catch (error) {
    console.error("Error updating sale event:", error);
    return actionError("Failed to update sale event");
  }
}

export async function deleteSaleEvent(spaceId: string, eventId: string) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.saleEvent.delete({
      where: { id: eventId, spaceId },
    });

    revalidatePath("/commerce/sales");
    return actionSuccess(null, "Sale event deleted");
  } catch (error) {
    console.error("Error deleting sale event:", error);
    return actionError("Failed to delete sale event");
  }
}

export async function toggleSaleEventActive(
  spaceId: string,
  eventId: string,
  isActive: boolean
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const saleEvent = await prisma.saleEvent.update({
      where: { id: eventId, spaceId },
      data: { isActive },
    });

    revalidatePath("/commerce/sales");
    return actionSuccess(saleEvent, "Sale event toggled");
  } catch (error) {
    console.error("Error toggling sale event:", error);
    return actionError("Failed to toggle sale event");
  }
}

export async function addProductsToSaleEvent(
  spaceId: string,
  eventId: string,
  products: { productId: string; salePrice?: number | null }[]
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Verify event belongs to space
    const event = await prisma.saleEvent.findFirst({
      where: { id: eventId, spaceId },
    });
    if (!event) {
      return actionError("Sale event not found");
    }

    // Use createMany with skipDuplicates to handle already-added products
    await prisma.saleEventProduct.createMany({
      data: products.map((p) => ({
        saleEventId: eventId,
        productId: p.productId,
        salePrice: p.salePrice ?? undefined,
      })),
      skipDuplicates: true,
    });

    revalidatePath(`/commerce/sales/${eventId}`);
    return actionSuccess(null, "Products added to sale");
  } catch (error) {
    console.error("Error adding products to sale event:", error);
    return actionError("Failed to add products to sale event");
  }
}

export async function removeProductFromSaleEvent(
  spaceId: string,
  eventId: string,
  productId: string
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Verify event belongs to space
    const event = await prisma.saleEvent.findFirst({
      where: { id: eventId, spaceId },
    });
    if (!event) {
      return actionError("Sale event not found");
    }

    await prisma.saleEventProduct.delete({
      where: {
        saleEventId_productId: { saleEventId: eventId, productId },
      },
    });

    revalidatePath(`/commerce/sales/${eventId}`);
    return actionSuccess(null, "Product removed from sale");
  } catch (error) {
    console.error("Error removing product from sale event:", error);
    return actionError("Failed to remove product from sale event");
  }
}

export async function updateSaleEventProduct(
  spaceId: string,
  eventId: string,
  productId: string,
  salePrice: number | null
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const event = await prisma.saleEvent.findFirst({
      where: { id: eventId, spaceId },
    });
    if (!event) {
      return actionError("Sale event not found");
    }

    await prisma.saleEventProduct.update({
      where: {
        saleEventId_productId: { saleEventId: eventId, productId },
      },
      data: { salePrice },
    });

    revalidatePath(`/commerce/sales/${eventId}`);
    return actionSuccess(null, "Sale product updated");
  } catch (error) {
    console.error("Error updating sale event product:", error);
    return actionError("Failed to update sale event product");
  }
}

export async function getActiveSaleEvents(spaceId: string) {
  const now = new Date();
  return prisma.saleEvent.findMany({
    where: {
      spaceId,
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      products: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              salePrice: true,
              onSale: true,
            },
          },
        },
      },
    },
    orderBy: { endDate: "asc" },
  });
}
