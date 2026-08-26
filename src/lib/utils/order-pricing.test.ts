import { describe, expect, it } from "vitest";
import {
  computeOrderTotals,
  priceOrderLines,
  round2,
  type PricingProduct,
} from "./order-pricing";

/**
 * These cover the arithmetic the Paystack amount check is verified against.
 * A bug here is a customer charged an amount the order route then rejects,
 * after the card has already been debited — so the cases are deliberately
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

  it("lets a variant price win over the product sale price", () => {
    const withVariant = product({
      onSale: true,
      salePrice: 7500,
      variants: [{ id: "v1", name: "Red", sku: "TOTE-R", price: 12000, costPrice: 5000 }],
    });
    const result = priceOrderLines(
      [withVariant],
      [{ productId: "p1", variantId: "v1", quantity: 1 }]
    );
    expect(result.ok && result.subtotal).toBe(12000);
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
   * would only matter if someone reimplemented the rounding elsewhere — which
   * is precisely what these shared helpers exist to prevent.
   */
  it("inherits binary float error at exact half-kobo values", () => {
    // 1.005 * 100 is 100.49999999999999, so this rounds DOWN.
    expect(round2(1.005)).toBe(1);
    // 2.675 * 100 is exactly representable, so this one rounds up as expected —
    // which is the point: the behaviour depends on the value, not the rule.
    expect(round2(2.675)).toBe(2.68);
  });
});

