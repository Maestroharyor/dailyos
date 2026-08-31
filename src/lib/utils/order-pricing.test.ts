import { describe, expect, it } from "vitest";
import {
  computeOrderTotals,
  type PricingProduct,
  priceOrderLines,
  productUnitPrice,
  round2,
  variantUnitPrice,
} from "./order-pricing";

/**
 * Stands in for a Prisma Decimal, which is what salePrice actually is at
 * runtime. The distinction is the whole point of these cases: a Decimal is an
 * object, so it is truthy whatever value it wraps, and a primitive 0 fixture
 * makes a broken truthiness check look correct.
 */
const decimal = (n: number) => ({ valueOf: () => n, toString: () => String(n) });

/**
 * These cover the arithmetic the Paystack amount check is verified against.
 * A bug here is a customer charged an amount the order route then rejects,
 * after the card has already been debited, so the cases are deliberately
 * exhaustive about rounding and about the discount/tax interaction.
 */

const product = (over: Partial<PricingProduct> = {}): PricingProduct => ({
  id: "p1",
  name: "Tote",
  sku: "TOTE-1",
  price: 10000,
  salePrice: null,
  costPrice: 4000,
  onSale: false,
  variants: [],
  ...over,
});

describe("priceOrderLines", () => {
  it("uses the list price when the product is not on sale", () => {
    const result = priceOrderLines([product()], [{ productId: "p1", quantity: 2 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subtotal).toBe(20000);
    expect(result.lines[0].unitPrice).toBe(10000);
  });

  it("uses the sale price only when onSale is set", () => {
    const onSale = priceOrderLines(
      [product({ onSale: true, salePrice: 7500 })],
      [{ productId: "p1", quantity: 1 }]
    );
    expect(onSale.ok && onSale.subtotal).toBe(7500);

    // A leftover salePrice with onSale false must not discount the order.
    const notOnSale = priceOrderLines(
      [product({ onSale: false, salePrice: 7500 })],
      [{ productId: "p1", quantity: 1 }]
    );
    expect(notOnSale.ok && notOnSale.subtotal).toBe(10000);
  });

  it("applies the product's markdown to the variant price as a ratio", () => {
    // This used to charge 12000 flat: a variant's price won outright and the
    // sale silently stopped applying, while the storefront went on showing the
    // discount badge. 10000 -> 7500 is x0.75, so the 12000 variant is 9000.
    const withVariant = product({
      onSale: true,
      salePrice: 7500,
      variants: [{ id: "v1", name: "Red", sku: "TOTE-R", price: 12000, costPrice: 5000 }],
    });
    const result = priceOrderLines(
      [withVariant],
      [{ productId: "p1", variantId: "v1", quantity: 1 }]
    );
    expect(result.ok && result.subtotal).toBe(9000);
    expect(result.ok && result.lines[0].name).toBe("Tote - Red");
  });

  it("rejects a variant that no longer exists rather than silently repricing", () => {
    const result = priceOrderLines(
      [product()],
      [{ productId: "p1", variantId: "gone", quantity: 1 }]
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("gone");
  });

  it("skips items whose product was not found", () => {
    const result = priceOrderLines([product()], [{ productId: "missing", quantity: 1 }]);
    expect(result.ok && result.subtotal).toBe(0);
    expect(result.ok && result.lines).toHaveLength(0);
  });
});

describe("computeOrderTotals", () => {
  it("adds tax and shipping with no discount", () => {
    expect(computeOrderTotals({ subtotal: 10000, taxRate: 7.5, shippingFee: 2000 })).toEqual({
      subtotal: 10000,
      discount: 0,
      tax: 750,
      shippingFee: 2000,
      freeShippingApplied: false,
      deposit: 0,
      total: 12750,
    });
  });

  it("taxes the discounted amount by default", () => {
    const totals = computeOrderTotals({
      subtotal: 10000,
      discount: 2000,
      taxRate: 7.5,
      shippingFee: 0,
    });
    expect(totals.tax).toBe(600);
    expect(totals.total).toBe(8600);
  });

  it("taxes the full subtotal when taxOnDiscountedAmount is off", () => {
    const totals = computeOrderTotals({
      subtotal: 10000,
      discount: 2000,
      taxRate: 7.5,
      shippingFee: 0,
      taxOnDiscountedAmount: false,
    });
    expect(totals.tax).toBe(750);
    // The discount still comes off what is owed; only the taxable base changes.
    expect(totals.total).toBe(8750);
  });

  it("never lets a discount exceed the goods value or make shipping free", () => {
    const totals = computeOrderTotals({
      subtotal: 5000,
      discount: 999999,
      taxRate: 10,
      shippingFee: 1500,
    });
    expect(totals.discount).toBe(5000);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(1500);
  });

  it("ignores a negative discount", () => {
    const totals = computeOrderTotals({ subtotal: 5000, discount: -100, taxRate: 0 });
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(5000);
  });

  it("rounds to two decimals so the kobo conversion is exact", () => {
    const totals = computeOrderTotals({ subtotal: 3333.33, taxRate: 7.5 });
    expect(totals.tax).toBe(250);
    expect(totals.total).toBe(3583.33);
    // What actually reaches Paystack.
    expect(Math.round(totals.total * 100)).toBe(358333);
  });

  it("handles a zero tax rate", () => {
    const totals = computeOrderTotals({ subtotal: 1000, taxRate: 0, shippingFee: 500 });
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(1500);
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(0.005)).toBe(0.01);
    expect(round2(12.344)).toBe(12.34);
    expect(round2(12.346)).toBe(12.35);
  });

  /**
   * Documents a real limitation rather than asserting a guarantee round2 does
   * not make. `Math.round(n * 100) / 100` inherits binary floating-point
   * error: 1.005 * 100 is 100.49999999999999, so it rounds DOWN to 1.
   *
   * This is not a charging bug. The quote endpoint and the order route call
   * this same function on the same inputs, and the Paystack verification
   * compares Math.round(total * 100) on both sides, so they agree exactly. It
   * would only matter if someone reimplemented the rounding elsewhere, which
   * is precisely what these shared helpers exist to prevent.
   */
  it("inherits binary float error at exact half-kobo values", () => {
    // 1.005 * 100 is 100.49999999999999, so this rounds DOWN.
    expect(round2(1.005)).toBe(1);
    // 2.675 * 100 is exactly representable, so this one rounds up as expected,
    // which is the point: the behaviour depends on the value, not the rule.
    expect(round2(2.675)).toBe(2.68);
  });
});

describe("computeOrderTotals, free shipping threshold", () => {
  const base = { subtotal: 80_000, taxRate: 7.5, shippingFee: 2000 };

  it("does not give free shipping when the threshold is 0", () => {
    // 0 means the feature is off, not "everything qualifies". Getting this
    // backwards would waive shipping on every order in every space, since 0 is
    // the column default.
    const totals = computeOrderTotals({ ...base, freeShippingThreshold: 0 });
    expect(totals.shippingFee).toBe(2000);
    expect(totals.freeShippingApplied).toBe(false);
  });

  it("charges shipping below the threshold", () => {
    const totals = computeOrderTotals({ ...base, subtotal: 69_999, freeShippingThreshold: 70_000 });
    expect(totals.shippingFee).toBe(2000);
    expect(totals.freeShippingApplied).toBe(false);
  });

  it("waives shipping exactly at the threshold", () => {
    // "over ₦70,000" in the storefront copy is inclusive at the boundary.
    const totals = computeOrderTotals({ ...base, subtotal: 70_000, freeShippingThreshold: 70_000 });
    expect(totals.shippingFee).toBe(0);
    expect(totals.freeShippingApplied).toBe(true);
    expect(totals.total).toBe(round2(70_000 + 70_000 * 0.075));
  });

  it("qualifies on the discounted amount, not the list subtotal", () => {
    // A threshold reached only by items that were then discounted away is not
    // one the customer actually reached.
    const totals = computeOrderTotals({
      ...base,
      subtotal: 75_000,
      discount: 10_000,
      freeShippingThreshold: 70_000,
    });
    expect(totals.shippingFee).toBe(2000);
    expect(totals.freeShippingApplied).toBe(false);
  });

  it("does not report a waiver when there was no fee to waive", () => {
    const totals = computeOrderTotals({
      ...base,
      shippingFee: 0,
      freeShippingThreshold: 70_000,
    });
    expect(totals.shippingFee).toBe(0);
    expect(totals.freeShippingApplied).toBe(false);
  });

  it("excludes tax from qualification", () => {
    // Tax must not push an order over the line: 65,000 + 7.5% is above 70,000,
    // but the goods are not.
    const totals = computeOrderTotals({ ...base, subtotal: 65_000, freeShippingThreshold: 70_000 });
    expect(totals.shippingFee).toBe(2000);
  });
});

describe("computeOrderTotals, per-option free shipping", () => {
  const base = { subtotal: 75000, taxRate: 0, freeShippingThreshold: 70000 };

  it("waives a fee on an option flagged for it", () => {
    const t = computeOrderTotals({
      ...base,
      shippingFee: 4000,
      shippingQualifiesForFreeShipping: true,
    });
    expect(t.shippingFee).toBe(0);
    expect(t.freeShippingApplied).toBe(true);
    expect(t.total).toBe(75000);
  });

  it("charges an option that is not flagged, even above the threshold", () => {
    const t = computeOrderTotals({
      ...base,
      shippingFee: 10000,
      shippingQualifiesForFreeShipping: false,
    });
    expect(t.shippingFee).toBe(10000);
    expect(t.freeShippingApplied).toBe(false);
    expect(t.total).toBe(85000);
  });

  it("defaults to qualifying so callers with no delivery concept are unchanged", () => {
    const t = computeOrderTotals({ ...base, shippingFee: 4000 });
    expect(t.shippingFee).toBe(0);
  });

  /**
   * Two options a merchant has both flagged, at very different fees, waived on
   * the same cart. This is not a bug: the threshold is one number and the flag
   * is what scopes it, so a merchant who ticks a 9,000 row has chosen to absorb
   * 9,000. It is pinned here because it is the output someone reads later and
   * asks about, and because the seeded default (only fees at or below 4,000
   * qualify) is what stops it arising by accident rather than anything in this
   * function.
   */
  it("waives both a cheap and an expensive fee when both are flagged", () => {
    const cheap = computeOrderTotals({
      ...base,
      shippingFee: 3000,
      shippingQualifiesForFreeShipping: true,
    });
    const dear = computeOrderTotals({
      ...base,
      shippingFee: 9000,
      shippingQualifiesForFreeShipping: true,
    });
    expect(cheap.shippingFee).toBe(0);
    expect(dear.shippingFee).toBe(0);
    expect(cheap.total).toBe(dear.total);
  });

  it("does not waive anything when the threshold is off, whatever the flag", () => {
    const t = computeOrderTotals({
      subtotal: 75000,
      taxRate: 0,
      freeShippingThreshold: 0,
      shippingFee: 4000,
      shippingQualifiesForFreeShipping: true,
    });
    expect(t.shippingFee).toBe(4000);
  });
});

describe("computeOrderTotals, refundable deposit", () => {
  it("adds the deposit to the total", () => {
    const t = computeOrderTotals({ subtotal: 20000, taxRate: 0, deposit: 1000 });
    expect(t.deposit).toBe(1000);
    expect(t.total).toBe(21000);
  });

  it("does not tax the deposit", () => {
    const withDeposit = computeOrderTotals({ subtotal: 20000, taxRate: 7.5, deposit: 1000 });
    const without = computeOrderTotals({ subtotal: 20000, taxRate: 7.5 });
    expect(withDeposit.tax).toBe(without.tax);
    expect(withDeposit.total).toBe(without.total + 1000);
  });

  /**
   * The deposit is a hold, not a price, so a threshold that waives carriage has
   * no business returning it at checkout. If this ever goes green the customer
   * stops paying a deposit on exactly the orders most likely to be abandoned.
   */
  it("is never waived by a qualifying free shipping threshold", () => {
    const t = computeOrderTotals({
      subtotal: 75000,
      taxRate: 0,
      shippingFee: 4000,
      freeShippingThreshold: 70000,
      shippingQualifiesForFreeShipping: true,
      deposit: 1000,
    });
    expect(t.shippingFee).toBe(0);
    expect(t.deposit).toBe(1000);
    expect(t.total).toBe(76000);
  });

  it("is not reduced by a discount", () => {
    const t = computeOrderTotals({
      subtotal: 20000,
      discount: 20000,
      taxRate: 0,
      deposit: 1000,
    });
    expect(t.deposit).toBe(1000);
    expect(t.total).toBe(1000);
  });

  it("clamps a negative deposit to zero", () => {
    expect(computeOrderTotals({ subtotal: 1000, taxRate: 0, deposit: -500 }).deposit).toBe(0);
  });

  it("defaults to zero so existing callers are unaffected", () => {
    expect(computeOrderTotals({ subtotal: 1000, taxRate: 0 }).deposit).toBe(0);
  });
});

/**
 * The ratio rule, isolated. priceOrderLines exercises it end to end above;
 * these are the edges, and every one of them is a case where the wrong answer
 * reaches Paystack as an amount.
 */
describe("productUnitPrice", () => {
  it("charges the sale price when there is one", () => {
    expect(productUnitPrice({ price: 10000, salePrice: 7500, onSale: true })).toBe(7500);
  });

  it("charges the list price when the product is not on sale", () => {
    expect(productUnitPrice({ price: 10000, salePrice: null, onSale: false })).toBe(10000);
    expect(productUnitPrice({ price: 10000, salePrice: 7500, onSale: false })).toBe(10000);
  });

  it("sees through a Decimal wrapper rather than its truthiness", () => {
    // The sibling of the variant case, and the one that was actually shipping:
    // a stored Decimal(0) is an object, so `onSale && salePrice` was true and
    // the line priced at nothing. It falls back to the list price now.
    expect(productUnitPrice({ price: decimal(10000), salePrice: decimal(0), onSale: true })).toBe(
      10000
    );
    expect(
      productUnitPrice({ price: decimal(10000), salePrice: decimal(7500), onSale: true })
    ).toBe(7500);
  });

  it("refuses a sale price at or above the list price", () => {
    expect(productUnitPrice({ price: 10000, salePrice: 15000, onSale: true })).toBe(10000);
    expect(productUnitPrice({ price: 10000, salePrice: 10000, onSale: true })).toBe(10000);
  });
});

describe("variantUnitPrice", () => {
  const sale = { price: 10000, salePrice: 7500, onSale: true };

  /**
   * A stand-in for Prisma's Decimal, which is what these columns actually hold.
   *
   * The distinction is the whole point of the guard: Decimal is an object, and
   * every non-null object is truthy, so the `onSale && salePrice` test this code
   * used to run passed for a stored zero and priced the line at nothing. A test
   * fixture built from a plain JS 0 is falsy and cannot reproduce that — it was
   * why the first version of the zero test passed while production stayed
   * broken. Number() reaches valueOf, which is how the real guard sees through
   * the wrapper.
   */

  it("takes the product's discount ratio off the variant price", () => {
    expect(variantUnitPrice(sale, { price: 12000 })).toBe(9000);
    expect(variantUnitPrice(sale, { price: 8000 })).toBe(6000);
  });

  it("leaves the variant alone when the product is not on sale", () => {
    expect(
      variantUnitPrice({ price: 10000, salePrice: null, onSale: false }, { price: 12000 })
    ).toBe(12000);
    // A leftover salePrice with onSale false must not discount anything.
    expect(
      variantUnitPrice({ price: 10000, salePrice: 7500, onSale: false }, { price: 12000 })
    ).toBe(12000);
  });

  it("sees through a Decimal wrapper rather than its truthiness", () => {
    // The shape production actually passes. Each of these would have slipped
    // past a truthiness test and priced the line at zero or at a markup.
    expect(
      variantUnitPrice(
        { price: decimal(10000), salePrice: decimal(0), onSale: true },
        { price: 12000 }
      )
    ).toBe(12000);
    expect(
      variantUnitPrice(
        { price: decimal(10000), salePrice: decimal(7500), onSale: true },
        { price: decimal(12000) }
      )
    ).toBe(9000);
    expect(
      variantUnitPrice(
        { price: decimal(10000), salePrice: decimal(15000), onSale: true },
        { price: 12000 }
      )
    ).toBe(12000);
  });

  it("rounds to whole units", () => {
    // 10000 -> 6667 is x0.6667; 9000 x 0.6667 = 6000.3, which must not reach
    // a total as a fraction and drift it away from the charged amount.
    expect(variantUnitPrice({ price: 10000, salePrice: 6667, onSale: true }, { price: 9000 })).toBe(
      6000
    );
    expect(Number.isInteger(variantUnitPrice(sale, { price: 3333 }))).toBe(true);
  });

  it("refuses a base price it cannot take a ratio of", () => {
    // Dividing by zero yields Infinity, which would be sent as an amount.
    expect(variantUnitPrice({ price: 0, salePrice: 0, onSale: true }, { price: 12000 })).toBe(
      12000
    );
    expect(variantUnitPrice({ price: null, salePrice: 7500, onSale: true }, { price: 12000 })).toBe(
      12000
    );
  });

  it("refuses a sale price that is not a markdown", () => {
    // A typo that marks 10000 "down" to 15000 must not charge 18000 for a
    // 12000 variant.
    expect(
      variantUnitPrice({ price: 10000, salePrice: 15000, onSale: true }, { price: 12000 })
    ).toBe(12000);
    expect(
      variantUnitPrice({ price: 10000, salePrice: 10000, onSale: true }, { price: 12000 })
    ).toBe(12000);
    expect(
      variantUnitPrice({ price: 10000, salePrice: -500, onSale: true }, { price: 12000 })
    ).toBe(12000);
  });

  it("treats a zero sale price as an empty column, not as free", () => {
    expect(variantUnitPrice({ price: 10000, salePrice: 0, onSale: true }, { price: 12000 })).toBe(
      12000
    );
    const noVariant = priceOrderLines(
      [product({ onSale: true, salePrice: 0 })],
      [{ productId: "p1", quantity: 1 }]
    );
    expect(noVariant.ok && noVariant.subtotal).toBe(10000);
  });

  it("does not price a Decimal(0) sale price as free", () => {
    // Both paths used `product.onSale && product.salePrice`, and a Decimal is
    // an object, so a stored Decimal(0) was truthy and priced the line at zero.
    // A primitive 0 is falsy and hid this — which is exactly what the case
    // above does, so it has to be tested with the runtime shape.
    expect(
      variantUnitPrice({ price: 10000, salePrice: decimal(0), onSale: true }, { price: 12000 })
    ).toBe(12000);
    expect(productUnitPrice({ price: 10000, salePrice: decimal(0), onSale: true })).toBe(10000);

    const order = priceOrderLines(
      [product({ onSale: true, salePrice: decimal(0) })],
      [{ productId: "p1", quantity: 1 }]
    );
    expect(order.ok && order.subtotal).toBe(10000);
  });

  it("prices a real Decimal markdown normally", () => {
    expect(productUnitPrice({ price: 10000, salePrice: decimal(7500), onSale: true })).toBe(7500);
    expect(
      variantUnitPrice({ price: 10000, salePrice: decimal(7500), onSale: true }, { price: 12000 })
    ).toBe(9000);
  });

  it("refuses a Decimal sale price above the base price", () => {
    // Same object-truthiness trap, one step further: this used to charge 15000
    // for a product listed at 10000.
    expect(productUnitPrice({ price: 10000, salePrice: decimal(15000), onSale: true })).toBe(10000);
  });

  it("prices a free variant at zero without producing NaN", () => {
    expect(variantUnitPrice(sale, { price: 0 })).toBe(0);
  });
});
