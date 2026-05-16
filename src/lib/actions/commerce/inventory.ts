"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const addStockSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().int().positive(),
  costAtTime: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const adjustStockSchema = z.object({
  inventoryItemId: z.string(),
  quantity: z.number().int(), // Can be positive or negative
  notes: z.string().optional(),
});

export type AddStockInput = z.infer<typeof addStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export async function addStock(spaceId: string, input: AddStockInput) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = addStockSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Verify inventory item belongs to space
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: parsed.data.inventoryItemId, spaceId },
    });

    if (!inventoryItem) {
      return actionError("Inventory item not found");
    }

    const movement = await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: parsed.data.inventoryItemId,
        type: "stock_in",
        quantity: parsed.data.quantity,
        costAtTime: parsed.data.costAtTime,
        notes: parsed.data.notes,
        referenceType: "purchase",
      },
    });

    revalidatePath("/commerce/inventory");
    return actionSuccess(movement, "Stock added");
  } catch (error) {
    console.error("Error adding stock:", error);
    return actionError("Failed to add stock");
  }
}

export async function adjustStock(spaceId: string, input: AdjustStockInput) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Verify inventory item belongs to space
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: parsed.data.inventoryItemId, spaceId },
    });

    if (!inventoryItem) {
      return actionError("Inventory item not found");
    }

    const movement = await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: parsed.data.inventoryItemId,
        type: "adjustment",
        quantity: parsed.data.quantity,
        notes: parsed.data.notes,
        referenceType: "adjustment",
      },
    });

    revalidatePath("/commerce/inventory");
    return actionSuccess(movement, "Stock adjusted");
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return actionError("Failed to adjust stock");
  }
}

export async function getInventoryMovements(
  spaceId: string,
  inventoryItemId: string,
  limit: number = 20
) {
  const authResult = await authorizeAction(spaceId, "view_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Verify inventory item belongs to space
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, spaceId },
      include: {
        product: { select: { name: true, sku: true } },
        variant: { select: { name: true, sku: true } },
      },
    });

    if (!inventoryItem) {
      return actionError("Inventory item not found");
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Calculate current stock using aggregation
    const stockAgg = await prisma.inventoryMovement.aggregate({
      where: { inventoryItemId },
      _sum: { quantity: true },
    });
    const currentStock = stockAgg._sum.quantity || 0;

    return actionSuccess({ inventoryItem, movements, currentStock }, "Movements retrieved");
  } catch (error) {
    console.error("Error fetching movements:", error);
    return actionError("Failed to fetch movements");
  }
}
