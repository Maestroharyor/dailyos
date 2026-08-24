/**
 * Discount code evaluation, shared by the commerce server action and the
 * storefront quote/order routes.
 *
 * This lives outside src/lib/actions because that directory is "use server":
 * every export there becomes a server action endpoint, so a route handler must
 * not import from it. The logic is the same one the POS and dashboard have
 * always used — it was just unreachable from HTTP.
 */

import { prisma } from "@/lib/db";
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
  {
    spaceId,
    code,
    orderTotal,
    customerId,
    productIds,
    currency = "USD",
  }: EvaluateDiscountParams
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

  let discountAmount = 0;
  if (discount.type === "percentage") {
    discountAmount = (orderTotal * Number(discount.value)) / 100;
    if (discount.maxDiscount && discountAmount > Number(discount.maxDiscount)) {
      discountAmount = Number(discount.maxDiscount);
    }
  } else {
    discountAmount = Number(discount.value);
  }

  if (discountAmount > orderTotal) {
    discountAmount = orderTotal;
  }

  return {
    ok: true,
    discount: {
      id: discount.id,
      code: discount.code,
      name: discount.name,
      type: discount.type,
      value: Number(discount.value),
      discountAmount: Math.round(discountAmount * 100) / 100,
    },
  };
}
