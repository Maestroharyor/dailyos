"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
import { z } from "zod";
import type { StockTakeStatus } from "@prisma/client";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

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

// Generate reference: ST-YYYYMMDD-XXXX (accepts tx for transaction safety)
async function generateReference(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const count = await tx.stockTake.count({
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
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createStockTakeSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
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
          select: { id: true, variantId: true },
        },
      },
    });

    // Calculate stock using aggregation instead of loading all movements
    const allInventoryItemIds = products.flatMap((p) =>
      p.inventoryItems.map((i) => i.id)
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

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
        for (const variant of product.variants) {
          const inventoryItem = product.inventoryItems.find(
            (ii) => ii.variantId === variant.id
          );
          const expectedQty = inventoryItem ? (stockMap.get(inventoryItem.id) || 0) : 0;

          stockTakeItems.push({
            productId: product.id,
            variantId: variant.id,
            productName: `${product.name} - ${variant.name}`,
            sku: variant.sku,
            expectedQty,
          });
        }
      } else {
        const inventoryItem = product.inventoryItems.find(
          (ii) => ii.variantId === null
        );
        const expectedQty = inventoryItem ? (stockMap.get(inventoryItem.id) || 0) : 0;

        stockTakeItems.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          sku: product.sku,
          expectedQty,
        });
      }
    }

    const stockTake = await prisma.$transaction(async (tx) => {
      const reference = await generateReference(tx, spaceId);

      return tx.stockTake.create({
        data: {
          spaceId,
          reference,
          location: parsed.data.location,
          notes: parsed.data.notes,
          createdBy: authResult.ctx.userId,
          items: {
            create: stockTakeItems,
          },
        },
        include: {
          items: true,
        },
      });
    });

    revalidatePath("/commerce/stock-takes");
    return actionSuccess(stockTake, "Stock take created");
  } catch (error) {
    console.error("Error creating stock take:", error);
    return actionError("Failed to create stock take");
  }
}

export async function updateStockTakeCount(
  spaceId: string,
  stockTakeId: string,
  input: UpdateCountInput
) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateCountSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Get the stock take item
    const stockTakeItem = await prisma.stockTakeItem.findFirst({
      where: { id: parsed.data.itemId, stockTake: { id: stockTakeId, spaceId } },
    });

    if (!stockTakeItem) {
      return actionError("Stock take item not found");
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
    return actionSuccess(updated, "Count updated");
  } catch (error) {
    console.error("Error updating stock take count:", error);
    return actionError("Failed to update count");
  }
}

export async function completeStockTake(
  spaceId: string,
  stockTakeId: string,
  applyAdjustments: boolean = true
) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const stockTake = await prisma.stockTake.findUnique({
      where: { id: stockTakeId, spaceId },
      include: { items: true },
    });

    if (!stockTake) {
      return actionError("Stock take not found");
    }

    if (stockTake.status !== "in_progress") {
      return actionError("Stock take is not in progress");
    }

    // Check all items have been counted
    const uncountedItems = stockTake.items.filter((item) => item.countedQty === null);
    if (uncountedItems.length > 0) {
      return actionError(`${uncountedItems.length} items have not been counted yet`);
    }

    // Wrap adjustments + status update in a transaction
    const updated = await prisma.$transaction(async (tx) => {
      if (applyAdjustments) {
        for (const item of stockTake.items) {
          // Skip items whose product was deleted (FK SetNull) — nothing to adjust
          if (!item.productId) continue;
          if (item.variance !== null && item.variance !== 0) {
            const inventoryItem = await tx.inventoryItem.upsert({
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

            await tx.inventoryMovement.create({
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

      return tx.stockTake.update({
        where: { id: stockTakeId },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });
    }, { timeout: 30000 });

    revalidatePath("/commerce/stock-takes");
    revalidatePath(`/commerce/stock-takes/${stockTakeId}`);
    revalidatePath("/commerce/inventory");
    return actionSuccess(updated, "Stock take completed");
  } catch (error) {
    console.error("Error completing stock take:", error);
    return actionError("Failed to complete stock take");
  }
}

export async function cancelStockTake(spaceId: string, stockTakeId: string) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const stockTake = await prisma.stockTake.findUnique({
      where: { id: stockTakeId, spaceId },
    });

    if (!stockTake) {
      return actionError("Stock take not found");
    }

    if (stockTake.status !== "in_progress") {
      return actionError("Can only cancel in-progress stock takes");
    }

    const updated = await prisma.stockTake.update({
      where: { id: stockTakeId },
      data: { status: "cancelled" },
    });

    revalidatePath("/commerce/stock-takes");
    return actionSuccess(updated, "Stock take cancelled");
  } catch (error) {
    console.error("Error cancelling stock take:", error);
    return actionError("Failed to cancel stock take");
  }
}
