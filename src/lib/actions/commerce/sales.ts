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

export interface ListSaleEventsFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listSaleEvents(
  spaceId: string,
  filters: ListSaleEventsFilters = {}
) {
  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const statusFilter = filters.status;
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));

    const where = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [saleEvents, total] = await Promise.all([
      prisma.saleEvent.findMany({
        where,
        include: {
          _count: { select: { products: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.saleEvent.count({ where }),
    ]);

    // Add computed status for each sale event
    const now = new Date();
    const eventsWithStatus = saleEvents
      .map((event) => {
        let status: "draft" | "scheduled" | "active" | "ended";

        if (!event.isActive) {
          status = "draft";
        } else if (now < event.startDate) {
          status = "scheduled";
        } else if (now >= event.startDate && now <= event.endDate) {
          status = "active";
        } else {
          status = "ended";
        }

        return {
          ...event,
          discountValue: Number(event.discountValue),
          startDate: event.startDate.toISOString(),
          endDate: event.endDate.toISOString(),
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
          status,
          productCount: event._count.products,
        };
      })
      .filter((event) => !statusFilter || event.status === statusFilter);

    return actionSuccess(
      {
        saleEvents: eventsWithStatus,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Sale events fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching sale events:", error);
    return actionError("Failed to fetch sale events");
  }
}

export async function getSaleEventDetail(spaceId: string, eventId: string) {
  const authResult = await authorizeAction(spaceId, "view_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const saleEvent = await prisma.saleEvent.findFirst({
      where: { id: eventId, spaceId },
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
                status: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true, alt: true },
                },
              },
            },
          },
          orderBy: { addedAt: "desc" },
        },
      },
    });

    if (!saleEvent) {
      return actionError("Sale event not found");
    }

    // Compute status
    const now = new Date();
    let status: "draft" | "scheduled" | "active" | "ended";
    if (!saleEvent.isActive) {
      status = "draft";
    } else if (now < saleEvent.startDate) {
      status = "scheduled";
    } else if (now >= saleEvent.startDate && now <= saleEvent.endDate) {
      status = "active";
    } else {
      status = "ended";
    }

    // Compute effective sale prices for products
    const productsWithPrices = saleEvent.products.map((sep) => {
      const originalPrice = Number(sep.product.price);
      let effectiveSalePrice: number;

      if (sep.salePrice) {
        effectiveSalePrice = Number(sep.salePrice);
      } else if (saleEvent.discountType === "percentage") {
        effectiveSalePrice =
          Math.round(
            originalPrice * (1 - Number(saleEvent.discountValue) / 100) * 100
          ) / 100;
      } else {
        effectiveSalePrice = Math.max(
          0,
          originalPrice - Number(saleEvent.discountValue)
        );
      }

      const discountPercent =
        Math.round(((originalPrice - effectiveSalePrice) / originalPrice) * 100);

      return {
        id: sep.id,
        productId: sep.product.id,
        name: sep.product.name,
        sku: sep.product.sku,
        originalPrice,
        effectiveSalePrice,
        overrideSalePrice: sep.salePrice ? Number(sep.salePrice) : null,
        discountPercent,
        status: sep.product.status,
        image: sep.product.images[0] || null,
        addedAt: sep.addedAt.toISOString(),
      };
    });

    return actionSuccess(
      {
        saleEvent: {
          id: saleEvent.id,
          name: saleEvent.name,
          slug: saleEvent.slug,
          description: saleEvent.description,
          discountType: saleEvent.discountType,
          discountValue: Number(saleEvent.discountValue),
          bannerImage: saleEvent.bannerImage,
          startDate: saleEvent.startDate.toISOString(),
          endDate: saleEvent.endDate.toISOString(),
          isActive: saleEvent.isActive,
          status,
          createdAt: saleEvent.createdAt.toISOString(),
          updatedAt: saleEvent.updatedAt.toISOString(),
          products: productsWithPrices,
        },
      },
      "Sale event fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching sale event:", error);
    return actionError("Failed to fetch sale event");
  }
}
