import { describe, expect, it } from "vitest";
import { NON_REVENUE_DEPOSIT_STATUSES, netRevenue, nonRevenueDepositFilter } from "./order-revenue";

describe("netRevenue", () => {
  it("is the gross total when no deposit was taken", () => {
    expect(netRevenue(99500, 0)).toBe(99500);
  });

  it("subtracts a held deposit", () => {
    expect(netRevenue(21000, 1000)).toBe(20000);
  });

  it("never reports negative revenue", () => {
    expect(netRevenue(500, 1000)).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(netRevenue(20000.005, 0.001)).toBe(20000);
  });
});

describe("nonRevenueDepositFilter", () => {
  /**
   * A forfeited deposit was retained, so it is real income and must not be
   * subtracted. If this list ever grows to include it, every no-show quietly
   * stops counting toward revenue.
   */
  it("covers held and returned deposits only", () => {
    expect([...NON_REVENUE_DEPOSIT_STATUSES]).toEqual(["held", "returned"]);
  });

  it("keeps the caller's own filter so both queries cover the same orders", () => {
    const filter = nonRevenueDepositFilter({ spaceId: "s1", status: { notIn: ["cancelled"] } });
    expect(filter.spaceId).toBe("s1");
    expect(filter.status).toEqual({ notIn: ["cancelled"] });
    expect(filter.depositFee).toEqual({ gt: 0 });
  });
});
