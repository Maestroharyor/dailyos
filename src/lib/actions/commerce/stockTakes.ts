"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import type { StockTakeStatus } from "@prisma/client";

// Validation schemas
const createStockTakeSchema = z.object({
  location: z.string().default("default"),
  notes: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(), // Optional: only count products in this category
});

const updateCountSchema = z.object({
  itemId: z.string(),
  countedQty: z.number().int().min(0),
  notes: z.string().optional().nullable(),
});

export type CreateStockTakeInput = z.infer<typeof createStockTakeSchema>;
export type UpdateCountInput = z.infer<typeof updateCountSchema>;

// Generate reference: ST-YYYYMMDD-XXXX
async function generateReference(spaceId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const count = await prisma.stockTake.count({
    where: {
      spaceId,
      startedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `ST-${dateStr}-${sequence}`;
}

export async function createStockTake(spaceId: string, input: CreateStockTakeInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createStockTakeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const reference = await generateReference(spaceId);

    // Get all products (optionally filtered by category)
    const products = await prisma.product.findMany({
      where: {
        spaceId,
        status: "active",
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
      },
      include: {
        variants: true,
        inventoryItems: {
          where: { location: parsed.data.location },
          include: {
            movements: true,
          },
        },
      },
    });

    // Build stock take items
    const stockTakeItems: {
      productId: string;
      variantId: string | null;
      productName: string;
      sku: string;
      expectedQty: number;
    }[] = [];

    for (const product of products) {
      if (product.variants.length > 0) {
        // Product has variants - create item per variant
        for (const variant of product.variants) {
          const inventoryItem = product.inventoryItems.find(
            (ii) => ii.variantId === variant.id
          );
          const expectedQty = inventoryItem
            ? inventoryItem.movements.reduce((sum, m) => sum + m.quantity, 0)
            : 0;

          stockTakeItems.push({
            productId: product.id,
            variantId: variant.id,
            productName: `${product.name} - ${variant.name}`,
            sku: variant.sku,
            expectedQty,
          });
        }
      } else {
        // No variants - create single item
        const inventoryItem = product.inventoryItems.find(
          (ii) => ii.variantId === null
        );
        const expectedQty = inventoryItem
          ? inventoryItem.movements.reduce((sum, m) => sum + m.quantity, 0)
          : 0;

        stockTakeItems.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          sku: product.sku,
          expectedQty,
        });
      }
    }

    const stockTake = await prisma.stockTake.create({
      data: {
        spaceId,
        reference,
        location: parsed.data.location,
        notes: parsed.data.notes,
        createdBy: session.user.id,
        items: {
          create: stockTakeItems,
        },
      },
      include: {
        items: true,
      },
    });

    revalidatePath("/commerce/stock-takes");
    return { success: true, stockTake };
  } catch (error) {
    console.error("Error creating stock take:", error);
    return { error: "Failed to create stock take" };
  }
}

export async function updateStockTakeCount(
  spaceId: string,
  stockTakeId: string,
  input: UpdateCountInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateCountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Get the stock take item
    const stockTakeItem = await prisma.stockTakeItem.findFirst({
      where: { id: parsed.data.itemId, stockTake: { id: stockTakeId, spaceId } },
    });

    if (!stockTakeItem) {
      return { error: "Stock take item not found" };
    }

    // Calculate variance
    const variance = parsed.data.countedQty - stockTakeItem.expectedQty;

    const updated = await prisma.stockTakeItem.update({
      where: { id: parsed.data.itemId },
      data: {
        countedQty: parsed.data.countedQty,
        variance,
        notes: parsed.data.notes,
      },
    });

    revalidatePath("/commerce/stock-takes");
    revalidatePath(`/commerce/stock-takes/${stockTakeId}`);
    return { success: true, item: updated };
  } catch (error) {
    console.error("Error updating stock take count:", error);
    return { error: "Failed to update count" };
  }
}

export async function completeStockTake(
  spaceId: string,
  stockTakeId: string,
  applyAdjustments: boolean = true
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const stockTake = await prisma.stockTake.findUnique({
      where: { id: stockTakeId, spaceId },
      include: { items: true },
    });

    if (!stockTake) {
      return { error: "Stock take not found" };
    }

    if (stockTake.status !== "in_progress") {
      return { error: "Stock take is not in progress" };
    }

    // Check all items have been counted
    const uncountedItems = stockTake.items.filter((item) => item.countedQty === null);
    if (uncountedItems.length > 0) {
      return { error: `${uncountedItems.length} items have not been counted yet` };
    }

    // Apply adjustments if requested
    if (applyAdjustments) {
      for (const item of stockTake.items) {
        if (item.variance !== null && item.variance !== 0) {
          // Find or create inventory item
          const inventoryItem = await prisma.inventoryItem.upsert({
            where: {
              spaceId_productId_variantId_location: {
                spaceId,
                productId: item.productId,
                variantId: item.variantId ?? "",
                location: stockTake.location,
              },
            },
            update: {},
            create: {
              spaceId,
              productId: item.productId,
              variantId: item.variantId,
              location: stockTake.location,
            },
          });

          // Create adjustment movement
          await prisma.inventoryMovement.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: "adjustment",
              quantity: item.variance,
              reference: stockTake.reference,
              referenceType: "stock_take",
              notes: `Stock take adjustment: ${item.notes || "Count discrepancy"}`,
            },
          });
        }
      }
    }

    // Update stock take status
    const updated = await prisma.stockTake.update({
      where: { id: stockTakeId },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    revalidatePath("/commerce/stock-takes");
    revalidatePath(`/commerce/stock-takes/${stockTakeId}`);
    revalidatePath("/commerce/inventory");
    return { success: true, stockTake: updated };
  } catch (error) {
    console.error("Error completing stock take:", error);
    return { error: "Failed to complete stock take" };
  }
}

export async function cancelStockTake(spaceId: string, stockTakeId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const stockTake = await prisma.stockTake.findUnique({
      where: { id: stockTakeId, spaceId },
    });

    if (!stockTake) {
      return { error: "Stock take not found" };
    }

    if (stockTake.status !== "in_progress") {
      return { error: "Can only cancel in-progress stock takes" };
    }

    const updated = await prisma.stockTake.update({
      where: { id: stockTakeId },
      data: { status: "cancelled" },
    });

    revalidatePath("/commerce/stock-takes");
    return { success: true, stockTake: updated };
  } catch (error) {
    console.error("Error cancelling stock take:", error);
    return { error: "Failed to cancel stock take" };
  }
}
