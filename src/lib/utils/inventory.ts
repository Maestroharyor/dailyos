import { prisma } from "@/lib/db";

/**
 * Calculate current stock for a single inventory item using DB aggregation.
 */
export async function getInventoryItemStock(
  inventoryItemId: string
): Promise<number> {
  const result = await prisma.inventoryMovement.aggregate({
    where: { inventoryItemId },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

/**
 * Calculate total stock for a product across all inventory items using DB aggregation.
 */
export async function getProductStock(
  productId: string,
  spaceId: string
): Promise<number> {
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { productId, spaceId },
    select: { id: true },
  });

  if (inventoryItems.length === 0) return 0;

  const result = await prisma.inventoryMovement.aggregate({
    where: {
      inventoryItemId: { in: inventoryItems.map((i) => i.id) },
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

/**
 * Calculate stock for multiple inventory items in a single query.
 * Returns a map of inventoryItemId -> stock.
 */
export async function getStockByInventoryItems(
  inventoryItemIds: string[]
): Promise<Map<string, number>> {
  if (inventoryItemIds.length === 0) return new Map();

  const results = await prisma.inventoryMovement.groupBy({
    by: ["inventoryItemId"],
    where: { inventoryItemId: { in: inventoryItemIds } },
    _sum: { quantity: true },
  });

  const stockMap = new Map<string, number>();
  for (const id of inventoryItemIds) {
    stockMap.set(id, 0);
  }
  for (const result of results) {
    stockMap.set(result.inventoryItemId, result._sum.quantity || 0);
  }
  return stockMap;
}
