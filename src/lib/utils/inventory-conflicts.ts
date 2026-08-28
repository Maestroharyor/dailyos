/**
 * Deciding whether a sale took more stock than the shop had.
 *
 * The decision is separated from the transaction that acts on it because it is
 * the part with a right answer, and because a `$transaction` is not somewhere
 * you can write a test.
 *
 * The policy behind it: **accept the sale, flag the discrepancy.** Never
 * refuse. A sale rung offline has already happened, the customer has the
 * goods and the cash is in the drawer, so refusing it at sync destroys a real
 * transaction to protect a number. The number is what is wrong, and the
 * correction has a physical cause someone in the shop has to look at.
 */

import type { OrderSource } from "@prisma/client";

export type StockConflictKind =
  /** Sold more than the movements say existed. */
  | "oversell"
  /**
   * The item has no inventory record at all, so no movement was written and
   * stock never moved. Reported rather than skipped: today this sale simply
   * evaporates from the stock ledger and nothing anywhere says so.
   */
  | "missing_inventory_item";

/**
 * Where a discrepancy came from.
 *
 * The order's own source, except that a sale queued offline and replayed is
 * recorded as `sync` regardless of where it was rung, a run of these arriving
 * together is what an outage looks like from the stock side, and that is the
 * thing worth being able to recognise.
 */
export type StockConflictSource = OrderSource | "sync";

const CONFLICT_SOURCES: readonly StockConflictSource[] = [
  "walk_in",
  "pos",
  "storefront",
  "manual",
  "sync",
];

const CONFLICT_KINDS: readonly StockConflictKind[] = ["oversell", "missing_inventory_item"];

/**
 * Narrow what the database hands back.
 *
 * `kind` and `source` are plain text columns, so a row written by an older
 * build, or by hand, can hold anything. Falling back keeps the sync screen
 * rendering the row: a discrepancy nobody can see is worse than one labelled
 * imprecisely, and the numbers beside it are the part that matters.
 */
export function toStockConflictSource(value: string): StockConflictSource {
  return CONFLICT_SOURCES.find((source) => source === value) ?? "manual";
}

export function toStockConflictKind(value: string): StockConflictKind {
  return CONFLICT_KINDS.find((kind) => kind === value) ?? "oversell";
}

export interface StockLine {
  productId: string;
  variantId?: string | null;
  quantity: number;
  /** The inventory item this line resolved to, or null if there is none. */
  inventoryItemId: string | null;
}

export interface StockConflict {
  kind: StockConflictKind;
  productId: string;
  variantId: string | null;
  inventoryItemId: string | null;
  quantityOrdered: number;
  stockBefore: number;
  stockAfter: number;
}

/**
 * Which lines of an order are a problem, given the stock as it stands.
 *
 * `stockBefore` maps inventory item id to the figure aggregated inside the
 * same transaction the movements are about to be written in.
 *
 * Lines are grouped by inventory item first. Two lines for the same item, the
 * same product added twice, which the POS allows, each look fine on their own
 * and oversell together, and checking them one at a time misses it.
 */
export function detectOversells(
  lines: StockLine[],
  stockBefore: ReadonlyMap<string, number>
): StockConflict[] {
  const conflicts: StockConflict[] = [];
  const byItem = new Map<string, StockLine[]>();

  for (const line of lines) {
    if (line.inventoryItemId === null) {
      conflicts.push({
        kind: "missing_inventory_item",
        productId: line.productId,
        variantId: line.variantId ?? null,
        inventoryItemId: null,
        quantityOrdered: line.quantity,
        stockBefore: 0,
        stockAfter: 0,
      });
      continue;
    }
    const existing = byItem.get(line.inventoryItemId);
    if (existing) existing.push(line);
    else byItem.set(line.inventoryItemId, [line]);
  }

  for (const [inventoryItemId, itemLines] of byItem) {
    const before = stockBefore.get(inventoryItemId) ?? 0;
    const ordered = itemLines.reduce((sum, line) => sum + line.quantity, 0);
    const after = before - ordered;

    // Zero is not an oversell. Selling the last one is the shop working.
    if (after >= 0) continue;

    const first = itemLines[0];
    conflicts.push({
      kind: "oversell",
      productId: first.productId,
      variantId: first.variantId ?? null,
      inventoryItemId,
      quantityOrdered: ordered,
      stockBefore: before,
      stockAfter: after,
    });
  }

  return conflicts;
}
