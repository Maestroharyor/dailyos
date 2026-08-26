/**
 * Discount code evaluation, shared by the commerce server action and the
 * storefront quote/order routes.
 *
 * This lives outside src/lib/actions because that directory is "use server":
 * every export there becomes a server action endpoint, so a route handler must
 * not import from it. The logic is the same one the POS and dashboard have
 * always used — it was just unreachable from HTTP.
 */

import type { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

/** Accepts the base client or an interactive-transaction client. */
type DiscountClient = Pick<typeof prisma, "discount" | "order">;

export interface AppliedDiscount {
  id: string;
  code: string;
  name: string;
  type: string;
  value: number;
  discountAmount: number;
}

export type DiscountEvaluation =
  | { ok: true; discount: AppliedDiscount }
  | { ok: false; error: string };

export interface EvaluateDiscountParams {
  spaceId: string;
  code: string;
  /** Goods subtotal the discount applies against. */
  orderTotal: number;
  customerId?: string | null;
  productIds?: string[];
  /** Space currency, so the minimum-order message isn't hardcoded to dollars. */
  currency?: string;
}

export async function evaluateDiscountCode(
  client: DiscountClient,
  { spaceId, code, orderTotal, customerId, productIds, currency = "USD" }: EvaluateDiscountParams
): Promise<DiscountEvaluation> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, error: "Enter a discount code" };
  }

  const discount = await client.discount.findUnique({
    where: { spaceId_code: { spaceId, code: normalized } },
  });

  if (!discount) {
    return { ok: false, error: "Invalid discount code" };
  }

  if (!discount.isActive) {
    return { ok: false, error: "This discount code is no longer active" };
  }

  const now = new Date();
  if (discount.startDate && now < discount.startDate) {
    return { ok: false, error: "This discount code is not yet active" };
  }
  if (discount.endDate && now > discount.endDate) {
    return { ok: false, error: "This discount code has expired" };
  }

  if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
    return { ok: false, error: "This discount code has reached its usage limit" };
  }

  if (discount.perCustomerLimit && customerId) {
    const customerUsage = await client.order.count({
      where: { spaceId, customerId, discountCode: normalized },
    });
    if (customerUsage >= discount.perCustomerLimit) {
      return { ok: false, error: "You have already used this discount code" };
    }
  }

  if (discount.minOrderAmount && orderTotal < Number(discount.minOrderAmount)) {
    return {
      ok: false,
      error: `Minimum order amount of ${formatCurrency(
        Number(discount.minOrderAmount),
        currency
      )} required`,
    };
  }

  // appliesTo holds product or category IDs; empty means the whole catalog.
  const appliesTo = discount.appliesTo as string[];
  if (appliesTo.length > 0 && productIds && productIds.length > 0) {
    const hasEligibleProduct = productIds.some((pid) => appliesTo.includes(pid));
    if (!hasEligibleProduct) {
      return { ok: false, error: "This discount does not apply to items in your cart" };
    }
  }

  return {
    ok: true,
    discount: {
      id: discount.id,
      code: discount.code,
      name: discount.name,
      type: discount.type,
      value: Number(discount.value),
      discountAmount: discountAmountFor(discount, orderTotal),
    },
  };
}

/** A discount's own terms: what it is worth, before asking if it may be used. */
export interface DiscountTerms {
  type: string;
  value: unknown;
  maxDiscount: unknown;
}

/**
 * What a code's terms are worth on a given cart, ignoring whether it may be
 * used at all.
 *
 * The split matters for a sale rung offline. Whether a code was still
 * available an hour ago is not something the server can check now, so it is
 * taken on trust from the receipt. What it was *worth* is right there in the
 * discount row and does not need trusting — which is what turns "honour the
 * receipt" from an unbounded claim into a bounded one.
 */
export function discountAmountFor(terms: DiscountTerms, orderTotal: number): number {
  let amount: number;
  if (terms.type === "percentage") {
    amount = (orderTotal * Number(terms.value)) / 100;
    if (terms.maxDiscount && amount > Number(terms.maxDiscount)) {
      amount = Number(terms.maxDiscount);
    }
  } else {
    amount = Number(terms.value);
  }

  if (amount > orderTotal) amount = orderTotal;
  return Math.round(Math.max(amount, 0) * 100) / 100;
}

/**
 * The most a code could possibly be worth on this cart. Zero when the code
 * does not exist, so an invented code buys nothing.
 */
export async function discountCeiling(
  client: DiscountClient,
  { spaceId, code, orderTotal }: { spaceId: string; code: string; orderTotal: number }
): Promise<number> {
  const discount = await client.discount.findUnique({
    where: { spaceId_code: { spaceId, code: code.trim().toUpperCase() } },
  });
  return discount ? discountAmountFor(discount, orderTotal) : 0;
}
