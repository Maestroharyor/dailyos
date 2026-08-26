import { describe, expect, it } from "vitest";
import { detectOversells, type StockLine } from "./inventory-conflicts";

function line(over: Partial<StockLine> & { quantity: number }): StockLine {
  return { productId: "p1", inventoryItemId: "inv1", ...over };
}

describe("detectOversells", () => {
  it("says nothing when there is enough stock", () => {
    expect(detectOversells([line({ quantity: 2 })], new Map([["inv1", 5]]))).toEqual([]);
  });

  // Selling the last one is the shop working, not a discrepancy.
  it("does not flag stock landing exactly on zero", () => {
    expect(detectOversells([line({ quantity: 5 })], new Map([["inv1", 5]]))).toEqual([]);
  });

  it("flags a sale that goes past what the movements say existed", () => {
    const [conflict] = detectOversells([line({ quantity: 3 })], new Map([["inv1", 1]]));
    expect(conflict).toMatchObject({
      kind: "oversell",
      quantityOrdered: 3,
      stockBefore: 1,
      stockAfter: -2,
    });
  });

  // Two lines for the same item — the same product added to the cart twice —
  // each look fine alone and oversell together. Checking them one at a time
  // misses it entirely.
  it("adds up two lines that resolve to the same inventory item", () => {
    const conflicts = detectOversells(
      [line({ quantity: 2 }), line({ quantity: 2 })],
      new Map([["inv1", 3]])
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ quantityOrdered: 4, stockBefore: 3, stockAfter: -1 });
  });

  it("keeps variants of one product apart", () => {
    const conflicts = detectOversells(
      [
        line({ quantity: 2, variantId: "v1", inventoryItemId: "inv1" }),
        line({ quantity: 2, variantId: "v2", inventoryItemId: "inv2" }),
      ],
      new Map([
        ["inv1", 5],
        ["inv2", 1],
      ])
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].variantId).toBe("v2");
  });

  // Today a line with no inventory item writes no movement at all: the sale
  // happens, stock never moves, and nothing anywhere records that it did not.
  it("reports a line with no inventory item rather than skipping it", () => {
    const [conflict] = detectOversells([line({ quantity: 2, inventoryItemId: null })], new Map());
    expect(conflict).toMatchObject({
      kind: "missing_inventory_item",
      quantityOrdered: 2,
      inventoryItemId: null,
    });
  });

  it("treats an inventory item with no movements as zero stock", () => {
    const [conflict] = detectOversells([line({ quantity: 1 })], new Map());
    expect(conflict).toMatchObject({ stockBefore: 0, stockAfter: -1 });
  });

  it("flags an item that was already negative before this sale", () => {
    const [conflict] = detectOversells([line({ quantity: 1 })], new Map([["inv1", -3]]));
    expect(conflict).toMatchObject({ stockBefore: -3, stockAfter: -4 });
  });

  it("handles an empty order", () => {
    expect(detectOversells([], new Map([["inv1", 5]]))).toEqual([]);
  });

  it("reports every conflicting line, not just the first", () => {
    const conflicts = detectOversells(
      [
        line({ quantity: 5, inventoryItemId: "inv1" }),
        line({ quantity: 5, inventoryItemId: "inv2" }),
        line({ quantity: 1, inventoryItemId: null, productId: "p3" }),
      ],
      new Map([
        ["inv1", 1],
        ["inv2", 1],
      ])
    );
    expect(conflicts).toHaveLength(3);
  });
});
