import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ORDER_STATUSES,
  countsAsRevenue,
  FULFILLED_ORDER_STATUSES,
  isTerminalOrderStatus,
  NOTIFIABLE_ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  orderStatusLabel,
  shouldAnnounceStatusChange,
} from "./order-status";

describe("order status labels", () => {
  it("labels every status", () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
      expect(ORDER_STATUS_COLORS[status]).toBeTruthy();
    }
  });

  /**
   * The regression this module exists for. Every status chip in the admin used
   * `className="capitalize"` on the raw enum value, which renders the new
   * state as "Out_for_delivery".
   */
  it("does not leak the enum's underscores into the UI", () => {
    expect(orderStatusLabel("out_for_delivery")).toBe("Out for delivery");
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_LABELS[status]).not.toContain("_");
    }
  });

  it("passes an unrecognised status straight through rather than rendering undefined", () => {
    expect(orderStatusLabel("some_future_status")).toBe("some_future_status");
  });
});

describe("order status ordering", () => {
  it("runs a storefront order from placed to delivered in order", () => {
    const index = (status: string) => ORDER_STATUSES.indexOf(status as never);

    expect(index("pending")).toBeLessThan(index("confirmed"));
    expect(index("confirmed")).toBeLessThan(index("processing"));
    expect(index("processing")).toBeLessThan(index("shipped"));
    expect(index("shipped")).toBeLessThan(index("out_for_delivery"));
    expect(index("out_for_delivery")).toBeLessThan(index("delivered"));
  });

  it("keeps the two exits last, since they are not steps on the way anywhere", () => {
    const tail = ORDER_STATUSES.slice(-2);
    expect(tail).toEqual(["cancelled", "refunded"]);
  });
});

describe("predicates", () => {
  it("treats only cancelled and refunded as terminal", () => {
    expect(isTerminalOrderStatus("cancelled")).toBe(true);
    expect(isTerminalOrderStatus("refunded")).toBe(true);
    expect(isTerminalOrderStatus("delivered")).toBe(false);
    expect(isTerminalOrderStatus("out_for_delivery")).toBe(false);
  });

  /**
   * Exclusion-based on purpose. A delivered order is money that was taken, and
   * the failure mode of an inclusion list is that revenue silently disappears
   * from the dashboard the day a new status ships.
   */
  it("counts every non-terminal status as revenue, including the new ones", () => {
    for (const status of ORDER_STATUSES) {
      expect(countsAsRevenue(status)).toBe(!isTerminalOrderStatus(status));
    }
    expect(countsAsRevenue("delivered")).toBe(true);
  });

  /** The verified-purchase check for reviews used to omit this outright. */
  it("counts a delivered order as fulfilled", () => {
    expect(FULFILLED_ORDER_STATUSES).toContain("delivered");
    expect(FULFILLED_ORDER_STATUSES).not.toContain("cancelled");
    expect(FULFILLED_ORDER_STATUSES).not.toContain("pending");
  });

  it("notifies on the delivery states but not on the two the confirmation email already covers", () => {
    expect(NOTIFIABLE_ORDER_STATUSES).toContain("shipped");
    expect(NOTIFIABLE_ORDER_STATUSES).toContain("out_for_delivery");
    expect(NOTIFIABLE_ORDER_STATUSES).toContain("delivered");
    expect(NOTIFIABLE_ORDER_STATUSES).not.toContain("pending");
    expect(NOTIFIABLE_ORDER_STATUSES).not.toContain("confirmed");
  });

  /**
   * Refunding creates a Return row and reverses stock. Reaching it from a
   * dropdown would move the order without any of that, so it is not offered.
   */
  it("offers every status except refunded in the dropdown", () => {
    expect(ASSIGNABLE_ORDER_STATUSES).not.toContain("refunded");
    expect(ASSIGNABLE_ORDER_STATUSES).toContain("delivered");
    expect(ASSIGNABLE_ORDER_STATUSES).toHaveLength(ORDER_STATUSES.length - 1);
  });
});

/**
 * The rule that keeps one status change to one email, however many times the
 * merchant walks the order back and forward through it.
 */
describe("shouldAnnounceStatusChange", () => {
  const announce = (previousStatus: string, nextStatus: string, priorVisits: number) =>
    shouldAnnounceStatusChange({ previousStatus, nextStatus, priorVisits });

  it("announces the first time an order goes out for delivery", () => {
    expect(announce("shipped", "out_for_delivery", 0)).toBe(true);
  });

  /** The reverted-and-re-applied case, which is the whole reason for the count. */
  it("stays silent when the order has been in that status before", () => {
    expect(announce("shipped", "out_for_delivery", 1)).toBe(false);
    expect(announce("shipped", "out_for_delivery", 4)).toBe(false);
  });

  it("stays silent when the status did not actually move", () => {
    expect(announce("out_for_delivery", "out_for_delivery", 0)).toBe(false);
  });

  it("stays silent for statuses the confirmation email already covers", () => {
    expect(announce("pending", "confirmed", 0)).toBe(false);
    expect(announce("confirmed", "pending", 0)).toBe(false);
  });

  /**
   * Reverting is a correction, so the step back is silent, but the next step
   * forward to somewhere new is still news.
   */
  it("still announces a genuinely new status reached after a revert", () => {
    expect(announce("out_for_delivery", "shipped", 1)).toBe(false);
    expect(announce("out_for_delivery", "delivered", 0)).toBe(true);
  });

  it("announces every notifiable status on first arrival", () => {
    for (const status of NOTIFIABLE_ORDER_STATUSES) {
      expect(announce("pending", status, 0)).toBe(true);
    }
  });
});
