import { describe, expect, it } from "vitest";
import {
  addLineToSale,
  changeLineQuantity,
  EMPTY_SALE,
  lineStockKey,
  type NewLine,
  type POSSale,
  reconcileSaleWithStock,
  removeLineFromSale,
  withRequestId,
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
    expect(sale.lines).toEqual([{ ...SHIRT, quantity: 1, maxStock: 4 }]);
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

  it("will not step below one, removing is a separate action", () => {
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
    expect(removeLineFromSale(sale, 0).lines.map((l) => l.sku)).toEqual(["SHIRT-L"]);
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
      new Map([
        ["p1:base", 1],
        ["p1:v-large", 5],
      ])
    );
    expect(result.sale.lines[0]).toMatchObject({ quantity: 1, maxStock: 1 });
    expect(result.clamped).toEqual([{ name: "Shirt", from: 3, to: 1 }]);
    expect(result.dropped).toEqual([]);
  });

  it("drops a line with nothing left to sell", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([
        ["p1:base", 0],
        ["p1:v-large", 5],
      ])
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
      new Map([
        ["p1:base", 20],
        ["p1:v-large", 20],
      ])
    );
    expect(result.sale.lines.map((l) => l.maxStock)).toEqual([20, 20]);
    // Quantities are the cashier's, not ours to raise.
    expect(result.sale.lines.map((l) => l.quantity)).toEqual([3, 1]);
    expect(result.clamped).toEqual([]);
  });

  it("returns the same sale when nothing needed changing", () => {
    const result = reconcileSaleWithStock(
      sale,
      new Map([
        ["p1:base", 5],
        ["p1:v-large", 5],
      ])
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

describe("withRequestId", () => {
  // The point of the whole thing: the cashier presses Complete Sale, it times
  // out, they press it again. A fresh key on that retry rings the sale twice
  // if the first attempt actually reached the server.
  it("keeps the key it already has, so a retry reuses it", () => {
    const first = withRequestId(EMPTY_SALE, () => "KEY-1");
    const second = withRequestId(first, () => "KEY-2");
    expect(second.requestId).toBe("KEY-1");
    expect(second).toBe(first);
  });

  it("mints one the first time", () => {
    expect(withRequestId(EMPTY_SALE, () => "KEY-1").requestId).toBe("KEY-1");
  });

  it("does not touch the lines", () => {
    const sale = saleWith([{ ...SHIRT, quantity: 1, maxStock: 3 }]);
    expect(withRequestId(sale, () => "KEY-1").lines).toEqual(sale.lines);
  });

  // A cleared cart is a new sale, and a new sale needs its own key, otherwise
  // the next sale would replay onto the last one's order.
  it("gives a cleared cart a fresh key", () => {
    const used = withRequestId(EMPTY_SALE, () => "KEY-1");
    expect(used.requestId).toBe("KEY-1");
    expect(withRequestId(EMPTY_SALE, () => "KEY-2").requestId).toBe("KEY-2");
  });
});

describe("the key and an edited cart", () => {
  // The failure this guards: submit, the request appears to fail but actually
  // lands, the cashier adds a forgotten item and presses Complete Sale again.
  // Under the same key the server correctly returns the original order, and
  // the added item goes unbilled with nobody told. So an edit has to mint a
  // new key. Enforced in the store's updateSale, which every edit routes
  // through; these pin the behaviour the pure functions have to make possible.
  it("returns a changed sale by identity, so a caller can tell an edit happened", () => {
    const sale = { ...EMPTY_SALE, requestId: "KEY-1" };
    const edited = addLineToSale(sale, SHIRT, 3);
    expect(edited).not.toBe(sale);
  });

  it("returns the identical object on a no-op, so a retry keeps its key", () => {
    const sale = { ...saleWith([{ ...SHIRT, quantity: 1, maxStock: 1 }]), requestId: "KEY-1" };
    expect(addLineToSale(sale, SHIRT, 1)).toBe(sale);
    expect(changeLineQuantity(sale, 0, 1)).toBe(sale);
    expect(removeLineFromSale(sale, 7)).toBe(sale);
  });

  it("mints a fresh key once the previous one has been cleared", () => {
    const cleared = { ...EMPTY_SALE, requestId: null };
    expect(withRequestId(cleared, () => "KEY-2").requestId).toBe("KEY-2");
  });
});

describe("the stock ceiling when offline", () => {
  // Offline, the stock figure is only as fresh as the last sync. Refusing on
  // it means refusing to sell goods that are physically on the shelf, with the
  // customer standing there.
  it("allows a line past the last known stock figure", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 1, { enforceStock: false });
    const again = addLineToSale(sale, SHIRT, 1, { enforceStock: false });
    expect(again.lines[0].quantity).toBe(2);
  });

  it("allows adding a product the last sync said was out of stock", () => {
    const sale = addLineToSale(EMPTY_SALE, SHIRT, 0, { enforceStock: false });
    expect(sale.lines).toHaveLength(1);
  });

  it("allows the stepper past the ceiling", () => {
    const sale = saleWith([{ ...SHIRT, quantity: 3, maxStock: 3 }]);
    expect(changeLineQuantity(sale, 0, 1, { enforceStock: false }).lines[0].quantity).toBe(4);
  });

  // Below one is never allowed, online or off: removing a line is a separate
  // action and has nothing to do with the network.
  it("still refuses to step below one", () => {
    const sale = saleWith([{ ...SHIRT, quantity: 1, maxStock: 3 }]);
    expect(changeLineQuantity(sale, 0, -1, { enforceStock: false })).toBe(sale);
  });

  it("enforces the ceiling by default, so a missing option cannot open it", () => {
    expect(addLineToSale(EMPTY_SALE, SHIRT, 0)).toBe(EMPTY_SALE);
  });
});
