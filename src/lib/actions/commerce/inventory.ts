"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import { z } from "zod";

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export interface InventoryFilters {
  search?: string;
  stock?: StockFilter;
  page?: number;
  limit?: number;
}

export async function listInventory(
  spaceId: string,
  filters: InventoryFilters = {}
) {
  const authResult = await authorizeAction(spaceId, "view_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const stock = filters.stock || "all"; // "all" | "in_stock" | "low_stock" | "out_of_stock"
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    // Get low stock threshold from settings
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { lowStockThreshold: true },
    });
    const threshold = settings?.lowStockThreshold ?? 10;

    // Build where clause
    const where: Prisma.InventoryItemWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          {
            product: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            },
          },
          {
            variant: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      }),
    };

    // Get inventory items with stock levels
    const inventoryItems = await prisma.inventoryItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            costPrice: true,
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
        variant: {
          select: { id: true, name: true, sku: true, costPrice: true },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    // Calculate stock levels using aggregation instead of loading all movements
    const inventoryItemIds = inventoryItems.map((i) => i.id);
    const stockMap = await getStockByInventoryItems(inventoryItemIds);

    const itemsWithStock = inventoryItems.map((item) => {
      const currentStock = stockMap.get(item.id) || 0;
      return {
        id: item.id,
        spaceId: item.spaceId,
        productId: item.productId,
        variantId: item.variantId,
        location: item.location,
        currentStock,
        isLowStock: currentStock > 0 && currentStock <= threshold,
        isOutOfStock: currentStock <= 0,
        product: {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          costPrice:
            item.product.costPrice == null
              ? null
              : Number(item.product.costPrice),
          images: item.product.images.map((img) => ({ url: img.url })),
        },
        variant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              sku: item.variant.sku,
              costPrice:
                item.variant.costPrice == null
                  ? null
                  : Number(item.variant.costPrice),
            }
          : null,
      };
    });

    // Filter by stock status
    let filteredItems = itemsWithStock;
    if (stock === "in_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock > threshold);
    } else if (stock === "low_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock > 0 && item.currentStock <= threshold);
    } else if (stock === "out_of_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock <= 0);
    }

    // Sort by stock level (critical items first)
    filteredItems.sort((a, b) => {
      if (a.currentStock <= 0 && b.currentStock > 0) return -1;
      if (a.currentStock > 0 && b.currentStock <= 0) return 1;
      if (a.currentStock <= threshold && b.currentStock > threshold) return -1;
      if (a.currentStock > threshold && b.currentStock <= threshold) return 1;
      return a.currentStock - b.currentStock;
    });

    // Calculate stats for all items (not filtered)
    const stats = {
      total: itemsWithStock.length,
      inStock: itemsWithStock.filter((i) => i.currentStock > threshold).length,
      lowStock: itemsWithStock.filter((i) => i.currentStock > 0 && i.currentStock <= threshold).length,
      outOfStock: itemsWithStock.filter((i) => i.currentStock <= 0).length,
    };

    // Paginate
    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit);

    return actionSuccess(
      {
        inventory: paginatedItems,
        threshold,
        stats,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Inventory fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return actionError("Failed to fetch inventory");
  }
}

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
