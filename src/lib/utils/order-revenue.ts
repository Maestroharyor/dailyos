import type { Prisma } from "@prisma/client";

/**
 * Revenue, once a refundable hold can sit inside an order total.
 *
 * `Order.total` is what the customer was charged, which is the right number for
 * a receipt and the wrong one for an income figure. A store pickup deposit is
 * taken at checkout and either handed back on collection or retained when
 * nobody comes. Until one of those happens it is a liability sitting in the
 * merchant's account, and counting it as revenue overstates income by the
 * deposit on every such order.
 *
 * The rule: subtract a deposit that is still held or has been returned. A
 * forfeited one was kept, so it is genuinely income and stays in.
 */

/** Deposit states whose amount is not the merchant's money to count. */
export const NON_REVENUE_DEPOSIT_STATUSES = ["held", "returned"] as const;

/**
 * Narrows an order filter to just the rows carrying a deposit that must come
 * out of a revenue figure. Compose it with the same where clause the revenue
 * aggregate uses, so the two always cover exactly the same orders.
 */
export function nonRevenueDepositFilter(where: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
  return {
    ...where,
    depositStatus: { in: [...NON_REVENUE_DEPOSIT_STATUSES] },
    depositFee: { gt: 0 },
  };
}

/** Gross charged, less the deposits that are not income. Never below zero. */
export function netRevenue(grossTotal: number, nonRevenueDeposits: number): number {
  return Math.max(0, Math.round((grossTotal - nonRevenueDeposits) * 100) / 100);
}
