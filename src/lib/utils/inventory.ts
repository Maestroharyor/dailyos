import { prisma } from "@/lib/db";

/**
 * The subset of the Prisma client these helpers need.
 *
 * Typed as a parameter so the same aggregation can run inside a transaction.
 * Reading stock from the module client while a transaction is open reads a
 * different snapshot than the one about to be written to, which is precisely
 * wrong for deciding whether a sale oversells.
 */
type StockClient = Pick<typeof prisma, "inventoryMovement">;

/** Same idea, for the helper below: usable inside a transaction. */
type InventoryClient = Pick<typeof prisma, "inventoryItem">;

/**
 * Finds the inventory item for a product/variant/location, creating it if it is
 * not there yet.
 *
 * Deliberately findFirst-then-create rather than `upsert` on
 * `spaceId_productId_variantId_location`. `variantId` is nullable, and Prisma
 * types a compound-unique `where` as non-nullable, so a unique lookup cannot
 * express "the row whose variantId is null" at all. The three callers worked
 * around that by passing `""`, which type-checks and always misses: the rows
 * they were looking for store NULL, written by the product-creation path that
 * omits the field. Every call therefore fell through to `create`, and because
 * Postgres treats NULLs as distinct in a unique index, nothing stopped it. A
 * non-variant product accumulated a fresh inventory row on every restock,
 * stock-take adjustment and purchase-order receipt.
 *
 * `findFirst` has no such restriction: `variantId: null` is a normal filter.
 */
export async function ensureInventoryItem(
  client: InventoryClient,
  where: { spaceId: string; productId: string; variantId: string | null; location: string }
): Promise<{ id: string }> {
  const existing = await client.inventoryItem.findFirst({
    where,
    select: { id: true },
  });
  if (existing) return existing;

  return client.inventoryItem.create({ data: where, select: { id: true } });
}

/**
 * Calculate current stock for a single inventory item using DB aggregation.
 */
export async function getInventoryItemStock(inventoryItemId: string): Promise<number> {
  const result = await prisma.inventoryMovement.aggregate({
    where: { inventoryItemId },
    _sum: { quantity: true },
  });
  return result._sum.quantity || 0;
}

/**
 * Calculate total stock for a product across all inventory items using DB aggregation.
 */
export async function getProductStock(productId: string, spaceId: string): Promise<number> {
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
  inventoryItemIds: string[],
  client: StockClient = prisma
): Promise<Map<string, number>> {
  if (inventoryItemIds.length === 0) return new Map();

  const results = await client.inventoryMovement.groupBy({
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
