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
 * The order ended without being fulfilled.
 *
 * Deliberately not the same question as "can this still be edited", even
 * though it once was. This one is about money: `countsAsRevenue` is its
 * inverse, so adding `completed` here would drop every completed counter sale
 * out of revenue reporting. Use `isLockedOrderStatus` for the edit question.
 */
export function isTerminalOrderStatus(status: string): boolean {
  return status === "cancelled" || status === "refunded";
}

/**
 * The order is finished and its status may not change again.
 *
 * `completed` joins the two unfulfilled endings here and nowhere else. It is
 * the end of a sale that went well, so it locks the record but still counts as
 * revenue, which is precisely why this cannot be folded back into
 * `isTerminalOrderStatus`.
 *
 * Enforced in `updateOrderStatus` and in both store-pickup transitions, not
 * only on the dropdown: the disabled control is a courtesy, the server check is
 * the rule.
 */
export function isLockedOrderStatus(status: string): boolean {
  return isTerminalOrderStatus(status) || status === "completed";
}

/**
 * The same set as `isLockedOrderStatus`, shaped for a Prisma `notIn` filter.
 *
 * Derived from the predicate rather than written out again, so the list and the
 * function cannot drift into disagreeing about which orders are finished.
 */
export const LOCKED_ORDER_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(isLockedOrderStatus);

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
 * The order actually reached the customer, so they can review what they got.
 *
 * Just the two end states, and the narrowness is the point. A card payment
 * lands an order straight on `confirmed` the moment it clears, so anything
 * wider lets someone pay for their own listing and post a "verified purchase"
 * review seconds later with nothing shipped, which is the fraud this gate
 * exists to stop. `shipped` and `out_for_delivery` fail the same test more
 * politely: on the way is not received.
 *
 * The cost is that a merchant who never advances an order past `shipped`
 * leaves their customers unable to review. That is the right way round: a
 * review nobody can write is recoverable by moving the order on, and a fake
 * review already published is not.
 *
 * `completed` carries store pickup, where nothing is ever `delivered`.
 */
export const REVIEWABLE_ORDER_STATUSES = [
  "delivered",
  "completed",
] as const satisfies readonly OrderStatus[];

/**
 * Statuses worth emailing a customer about.
 *
 * `pending` and `confirmed` are excluded because the order-confirmation email
 * already covers that moment; sending again would be two emails for one event.
 *
 * `shipped` is excluded too, and that is a judgement about how much mail one
 * delivery is worth. It is an internal handover, and on a same-day Lagos
 * delivery it lands minutes before `out_for_delivery`, which is the message
 * that actually asks something of the customer: be reachable, the rider is
 * coming. Two notifications that close together train people to ignore both.
 * The status is still recorded and still shows on the order timeline.
 */
export const NOTIFIABLE_ORDER_STATUSES = [
  "processing",
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
