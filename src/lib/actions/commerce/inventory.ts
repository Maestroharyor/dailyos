"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = addStockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Verify inventory item belongs to space
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: parsed.data.inventoryItemId, spaceId },
    });

    if (!inventoryItem) {
      return { error: "Inventory item not found" };
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
    return { success: true, movement };
  } catch (error) {
    console.error("Error adding stock:", error);
    return { error: "Failed to add stock" };
  }
}

export async function adjustStock(spaceId: string, input: AdjustStockInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = adjustStockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Verify inventory item belongs to space
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { id: parsed.data.inventoryItemId, spaceId },
    });

    if (!inventoryItem) {
      return { error: "Inventory item not found" };
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
    return { success: true, movement };
  } catch (error) {
    console.error("Error adjusting stock:", error);
    return { error: "Failed to adjust stock" };
  }
}

export async function getInventoryMovements(
  spaceId: string,
  inventoryItemId: string,
  limit: number = 20
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
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
      return { error: "Inventory item not found" };
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Calculate running stock
    const allMovements = await prisma.inventoryMovement.findMany({
      where: { inventoryItemId },
      select: { quantity: true },
    });
    const currentStock = allMovements.reduce((sum, m) => sum + m.quantity, 0);

    return {
      success: true,
      inventoryItem,
      movements,
      currentStock,
    };
  } catch (error) {
    console.error("Error fetching movements:", error);
    return { error: "Failed to fetch movements" };
  }
}
