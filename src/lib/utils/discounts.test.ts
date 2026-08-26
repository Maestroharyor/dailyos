import { describe, expect, it, vi } from "vitest";
import { evaluateDiscountCode } from "./discounts";

/**
 * evaluateDiscountCode decides how much money comes off an order, so every
 * rejection branch is covered. The client only ever sends a code — the amount
 * is always computed here — which is why a wrong answer here is a wrong charge.
 */

type DiscountRow = Record<string, unknown>;

function client(discount: DiscountRow | null, orderCount = 0) {
  return {
    discount: { findUnique: vi.fn().mockResolvedValue(discount) },
    order: { count: vi.fn().mockResolvedValue(orderCount) },
  } as unknown as Parameters<typeof evaluateDiscountCode>[0];
}

const base: DiscountRow = {
  id: "d1",
  code: "SAVE10",
  name: "Ten off",
  type: "percentage",
  value: 10,
  isActive: true,
  startDate: null,
  endDate: null,
  usageLimit: null,
  usageCount: 0,
  perCustomerLimit: null,
  minOrderAmount: null,
  maxDiscount: null,
  appliesTo: [],
};

const params = { spaceId: "s1", code: "SAVE10", orderTotal: 10000, currency: "NGN" };

describe("evaluateDiscountCode", () => {
  it("applies a percentage discount", async () => {
    const result = await evaluateDiscountCode(client(base), params);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.discount.discountAmount).toBe(1000);
  });

  it("applies a fixed discount", async () => {
    const result = await evaluateDiscountCode(
      client({ ...base, type: "fixed_amount", value: 2500 }),
      params,
    );
    expect(result.ok && result.discount.discountAmount).toBe(2500);
  });

  it("caps a percentage discount at maxDiscount", async () => {
    const result = await evaluateDiscountCode(client({ ...base, maxDiscount: 500 }), params);
    expect(result.ok && result.discount.discountAmount).toBe(500);
  });

  it("never discounts more than the order is worth", async () => {
    const result = await evaluateDiscountCode(
      client({ ...base, type: "fixed_amount", value: 999999 }),
      params,
    );
    expect(result.ok && result.discount.discountAmount).toBe(10000);
  });

  it("uppercases the looked-up code so casing doesn't matter to shoppers", async () => {
    const c = client(base);
    await evaluateDiscountCode(c, { ...params, code: "  save10  " });
    expect(c.discount.findUnique).toHaveBeenCalledWith({
      where: { spaceId_code: { spaceId: "s1", code: "SAVE10" } },
    });
  });

  it("rejects an empty code without hitting the database", async () => {
    const c = client(base);
    const result = await evaluateDiscountCode(c, { ...params, code: "   " });
    expect(result.ok).toBe(false);
    expect(c.discount.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown code", async () => {
    const result = await evaluateDiscountCode(client(null), params);
    expect(result).toEqual({ ok: false, error: "Invalid discount code" });
  });

  it("rejects an inactive code", async () => {
    const result = await evaluateDiscountCode(client({ ...base, isActive: false }), params);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no longer active");
  });

  it("rejects a code that has not started", async () => {
    const startDate = new Date(Date.now() + 86_400_000);
    const result = await evaluateDiscountCode(client({ ...base, startDate }), params);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not yet active");
  });

  it("rejects an expired code", async () => {
    const endDate = new Date(Date.now() - 86_400_000);
    const result = await evaluateDiscountCode(client({ ...base, endDate }), params);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("expired");
  });

  it("rejects a code that hit its global usage limit", async () => {
    const result = await evaluateDiscountCode(
      client({ ...base, usageLimit: 5, usageCount: 5 }),
      params,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("usage limit");
  });

  it("rejects a code the customer already used up", async () => {
    const result = await evaluateDiscountCode(client({ ...base, perCustomerLimit: 1 }, 1), {
      ...params,
      customerId: "c1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("already used");
  });

  it("skips the per-customer check for guests", async () => {
    // No customerId means no order history to check, so the code still applies.
    const result = await evaluateDiscountCode(client({ ...base, perCustomerLimit: 1 }, 5), params);
    expect(result.ok).toBe(true);
  });

  it("rejects an order below the minimum, naming the amount in the space currency", async () => {
    const result = await evaluateDiscountCode(client({ ...base, minOrderAmount: 20000 }), params);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Regression guard: this message used to hardcode a dollar sign.
    expect(result.error).toContain("₦");
    expect(result.error).not.toContain("$");
  });

  it("rejects a code scoped to products that aren't in the cart", async () => {
    const result = await evaluateDiscountCode(client({ ...base, appliesTo: ["other"] }), {
      ...params,
      productIds: ["p1"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("does not apply");
  });

  it("accepts a scoped code when an eligible product is in the cart", async () => {
    const result = await evaluateDiscountCode(client({ ...base, appliesTo: ["p1"] }), {
      ...params,
      productIds: ["p1", "p2"],
    });
    expect(result.ok).toBe(true);
  });
});
