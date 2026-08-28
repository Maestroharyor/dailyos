/**
 * The one definition of an order status.
 *
 * There were five copies of this before: four `statusColors` maps (order
 * detail, order list, customer detail, commerce dashboard) and four
 * hand-maintained TypeScript unions. Three of the colour maps were typed
 * `Record<OrderStatus, ...>` and so at least failed the build when the union
 * grew; the dashboard's was `Record<string, ...>` and silently rendered an
 * undefined colour instead. Adding the delivery states meant touching all of
 * them, so they collapse into this.
 *
 * `completed` and `delivered` both exist and both are terminal, on purpose.
 * `completed` is where a walk-in or POS sale ends: goods handed across a
 * counter, nothing to deliver. `delivered` is where a storefront order ends.
 * Merging them would make the POS flow claim a delivery that never happened.
 */

import type { OrderStatus } from "@prisma/client";

export type { OrderStatus };

/**
 * Chronological, matching the enum's declared order in Postgres so that
 * `ORDER BY status` and this array agree. The two terminal-by-failure states
 * sort last because they are exits, not steps.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
] as const satisfies readonly OrderStatus[];

/**
 * Human labels. The reason this exists rather than a `capitalize` class: that
 * is what the UI did before, and it renders `out_for_delivery` as
 * "Out_for_delivery".
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** HeroUI Chip / Select colour per status. */
export const ORDER_STATUS_COLORS: Record<
  OrderStatus,
  "default" | "primary" | "secondary" | "success" | "warning" | "danger"
> = {
  pending: "warning",
  confirmed: "primary",
  processing: "secondary",
  shipped: "secondary",
  out_for_delivery: "primary",
  delivered: "success",
  completed: "success",
  cancelled: "danger",
  refunded: "default",
};

/**
 * Statuses the merchant can select. Every status except `refunded`, which is
 * reached through the refund flow so that a `Return` row and the stock
 * movements are created alongside it. Setting it from a dropdown would move
 * the order without any of that.
 */
export const ASSIGNABLE_ORDER_STATUSES = ORDER_STATUSES.filter((status) => status !== "refunded");

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

/**
 * No further transitions are possible. Drives the disabled state on the status
 * dropdown.
 */
export function isTerminalOrderStatus(status: string): boolean {
  return status === "cancelled" || status === "refunded";
}

/**
 * Whether an order's total counts towards revenue. Exclusion-based on purpose:
 * every reporting call site already reads `notIn: ["cancelled", "refunded"]`,
 * so a status added later counts as revenue by default. That is the safe
 * direction to fail, because the alternative silently drops real money out of
 * the dashboard the day a new state ships.
 */
export function countsAsRevenue(status: string): boolean {
  return !isTerminalOrderStatus(status);
}

/**
 * The order reached the customer. Used for the verified-purchase check on
 * reviews, which was an inclusion list that would have excluded `delivered`,
 * the one status that most certainly proves a purchase.
 */
export const FULFILLED_ORDER_STATUSES = [
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
] as const satisfies readonly OrderStatus[];

/**
 * Statuses worth emailing a customer about. `pending` and `confirmed` are
 * excluded because the order-confirmation email already covers that moment;
 * sending again would be two emails for one event.
 */
export const NOTIFIABLE_ORDER_STATUSES = [
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
] as const satisfies readonly OrderStatus[];

const NOTIFIABLE = new Set<string>(NOTIFIABLE_ORDER_STATUSES);

/**
 * Whether a status change is worth emailing the customer about.
 *
 * `priorVisits` is how many times this order has already been in the target
 * status, counted from its status history before the current change is
 * recorded. Zero means this is the first time.
 *
 * That count is the whole point. A merchant who marks an order out for
 * delivery, notices the rider has not left yet, drops it back to shipped and
 * then marks it out for delivery again has corrected a mistake, not delivered
 * anything twice. Announcing the second one would land as a duplicate in the
 * customer's inbox and, worse, teach them that the notification means nothing.
 * So every status announces exactly once per order, whatever route it took to
 * get there.
 */
export function shouldAnnounceStatusChange(params: {
  previousStatus: string;
  nextStatus: string;
  priorVisits: number;
}): boolean {
  if (params.previousStatus === params.nextStatus) return false;
  if (!NOTIFIABLE.has(params.nextStatus)) return false;
  return params.priorVisits === 0;
}
