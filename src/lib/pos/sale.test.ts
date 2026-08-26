import { describe, expect, it } from "vitest";
import {
  addLineToSale,
  changeLineQuantity,
  lineStockKey,
  reconcileSaleWithStock,
  removeLineFromSale,
  EMPTY_SALE,
  type NewLine,
  type POSSale,
} from "./sale";

const SHIRT: NewLine = {
  productId: "p1",
  name: "Shirt",
  sku: "SHIRT",
  price: 5000,
  costPrice: 2000,
};

const SHIRT_LARGE: NewLine = { ...SHIRT, variantId: "v-large", sku: "SHIRT-L" };

function saleWith(lines: POSSale["lines"]): POSSale {
  return { ...EMPTY_SALE, lines };
}

describe("addLineToSale", () => {
  it("adds a line with quantity 1 and the live stock as its ceiling", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 4);
    expect(sale.lines).toEqual([
      { ...SHIRT, quantity: 1, maxStock: 4 },
    ]);
  });

  it("increments the existing line rather than adding a second one", () => {
    const once = addLineToSale(EMPTY_SALE, SHIRT, 4);
    const twice = addLineToSale(once, SHIRT, 4);
    expect(twice.lines).toHaveLength(1);
    expect(twice.lines[0].quantity).toBe(2);
  });

  it("treats two variants of one product as separate lines", () => {
    const sale = addLineToSale(addLineToSale(EMPTY_SALE, SHIRT, 4), SHIRT_LARGE, 4);
    expect(sale.lines).toHaveLength(2);
    expect(sale.lines.map((l) => l.variantId)).toEqual([undefined, "v-large"]);
  });

  it("refuses to add anything when stock is zero", () => {
    expect(addLineToSale(EMPTY_SALE, SHIRT, 0)).toBe(EMPTY_SALE);
  });

  it("refuses to increment past the live stock figure", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 1);
    expect(addLineToSale(sale, SHIRT, 1)).toBe(sale);
  });

  // A restock while the basket is open should lift the ceiling, otherwise the
  // cashier has to remove the line and re-add it to sell the new units.
  it("refreshes the ceiling from the live figure when incrementing", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 1);
    const restocked = addLineToSale(sale, SHIRT, 9);
    expect(restocked.lines[0]).toMatchObject({ quantity: 2, maxStock: 9 });
  });

  it("returns the same object on a no-op so a store does not re-render", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 2);
    expect(addLineToSale(sale, SHIRT, 0)).toBe(sale);
  });

  it("never mutates the sale it was given", () => {
    const before = addLineToSale(EMPTY_SALE, SHIRT, 4);
    const snapshot = structuredClone(before);
    addLineToSale(before, SHIRT, 4);
    expect(before).toEqual(snapshot);
  });
});

describe("changeLineQuantity", () => {
  const sale = saleWith([{ ...SHIRT, quantity: 2, maxStock: 3 }]);

  it("steps up and down", () => {
    expect(changeLineQuantity(sale, 0, 1).lines[0].quantity).toBe(3);
    expect(changeLineQuantity(sale, 0, -1).lines[0].quantity).toBe(1);
  });

  it("will not step below one — removing is a separate action", () => {
    const one = saleWith([{ ...SHIRT, quantity: 1, maxStock: 3 }]);
    expect(changeLineQuantity(one, 0, -1)).toBe(one);
  });

  it("will not step past the line's ceiling", () => {
    expect(changeLineQuantity(sale, 0, 2)).toBe(sale);
  });

  it("ignores an index that isn't there", () => {
    expect(changeLineQuantity(sale, 7, 1)).toBe(sale);
  });

  it("never mutates the sale it was given", () => {
    const snapshot = structuredClone(sale);
    changeLineQuantity(sale, 0, 1);
    expect(sale).toEqual(snapshot);
  });
});

describe("removeLineFromSale", () => {
  const sale = saleWith([
    { ...SHIRT, quantity: 1, maxStock: 3 },
    { ...SHIRT_LARGE, quantity: 2, maxStock: 3 },
  ]);

  it("removes by index", () => {
    expect(removeLineFromSale(sale, 0).lines.map((l) => l.sku)).toEqual([
      "SHIRT-L",
    ]);
  });

  it("ignores an index that isn't there", () => {
    expect(removeLineFromSale(sale, 7)).toBe(sale);
  });
});

describe("lineStockKey", () => {
  it("keys a variant-less line as base, matching getPOSProducts", () => {
    expect(lineStockKey({ productId: "p1" })).toBe("p1:base");
    expect(lineStockKey({ productId: "p1", variantId: "v1" })).toBe("p1:v1");
  });
});

describe("reconcileSaleWithStock", () => {
  const sale = saleWith([
    { ...SHIRT, quantity: 3, maxStock: 5 },
    { ...SHIRT_LARGE, quantity: 1, maxStock: 5 },
  ]);

  it("cuts a quantity to the stock that is actually there", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([["p1:base", 1], ["p1:v-large", 5]])
    );
    expect(result.sale.lines[0]).toMatchObject({ quantity: 1, maxStock: 1 });
    expect(result.clamped).toEqual([{ name: "Shirt", from: 3, to: 1 }]);
    expect(result.dropped).toEqual([]);
  });

  it("drops a line with nothing left to sell", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([["p1:base", 0], ["p1:v-large", 5]])
    );
    expect(result.sale.lines).toHaveLength(1);
    expect(result.dropped).toEqual(["Shirt"]);
  });

  // An absent key means "we did not ask", not "there is none". Deleting a
  // customer's basket because a lookup came back short is the worse failure.
  it("leaves a line alone when its stock is unknown", () => {
    const result = reconcileSaleWithStock(sale, new Map([["p1:v-large", 5]]));
    expect(result.sale.lines).toHaveLength(2);
    expect(result.sale.lines[0].quantity).toBe(3);
    expect(result.clamped).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it("lifts the ceiling when stock went up while the cart sat", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([["p1:base", 20], ["p1:v-large", 20]])
    );
    expect(result.sale.lines.map((l) => l.maxStock)).toEqual([20, 20]);
    // Quantities are the cashier's, not ours to raise.
    expect(result.sale.lines.map((l) => l.quantity)).toEqual([3, 1]);
    expect(result.clamped).toEqual([]);
  });

  it("returns the same sale when nothing needed changing", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([["p1:base", 5], ["p1:v-large", 5]])
    );
    expect(result.sale).toBe(sale);
  });

  it("handles an empty cart", () => {
    expect(reconcileSaleWithStock(EMPTY_SALE, new Map()).sale).toBe(EMPTY_SALE);
  });

  it("never mutates the sale it was given", () => {
    const snapshot = structuredClone(sale);
    reconcileSaleWithStock(sale, new Map([["p1:base", 1]]));
    expect(sale).toEqual(snapshot);
  });
});
