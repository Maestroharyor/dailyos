import { describe, expect, it } from "vitest";
import { earnLoyaltyForOrder } from "./loyalty";

/**
 * A transaction client stubbed down to the three calls this function makes.
 *
 * Only the arithmetic is under test here: how many points an order earns, and
 * what that figure is derived from. The writes are recorded so a test can
 * assert that nothing was written when nothing was earned.
 */
function fakeTx(settings: { loyaltyEnabled: boolean; loyaltyPointsPerDollar: number } | null) {
  const writes: { transactions: unknown[]; increments: number[] } = {
    transactions: [],
    increments: [],
  };
  const tx = {
    commerceSettings: { findUnique: async () => settings },
    loyaltyTransaction: {
      create: async ({ data }: { data: unknown }) => {
        writes.transactions.push(data);
      },
    },
    customer: {
      update: async ({ data }: { data: { loyaltyPoints: { increment: number } } }) => {
        writes.increments.push(data.loyaltyPoints.increment);
      },
    },
  };
  // The real parameter is the extended client's transaction type, which exists
  // to describe every model on it. Nothing here reaches past the three above.
  return { tx: tx as unknown as Parameters<typeof earnLoyaltyForOrder>[0], writes };
}

const order = {
  spaceId: "space_1",
  customerId: "cus_1",
  orderId: "ord_1",
  orderNumber: "SF-1",
};

describe("earnLoyaltyForOrder", () => {
  const enabled = { loyaltyEnabled: true, loyaltyPointsPerDollar: 1 };

  it("earns on the order total when there is no deposit", async () => {
    const { tx, writes } = fakeTx(enabled);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 21000, deposit: 0 })).toBe(21000);
    expect(writes.increments).toEqual([21000]);
  });

  /**
   * The bug this covers. A store-pickup deposit is a refundable hold that sits
   * inside `Order.total`. Earning on it means the customer hands over 1,000,
   * collects their order, gets the 1,000 back, and keeps points as though they
   * had spent it - points that outlive the money.
   */
  it("does not earn on a refundable deposit", async () => {
    const { tx, writes } = fakeTx(enabled);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 21000, deposit: 1000 })).toBe(
      20000
    );
    expect(writes.increments).toEqual([20000]);
  });

  it("writes nothing when the deposit is the whole total", async () => {
    const { tx, writes } = fakeTx(enabled);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 1000, deposit: 1000 })).toBe(0);
    expect(writes.transactions).toEqual([]);
    expect(writes.increments).toEqual([]);
  });

  /** Never awards points for a deposit larger than the total, whatever produced that. */
  it("floors at zero rather than going negative", async () => {
    const { tx } = fakeTx(enabled);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 500, deposit: 1000 })).toBe(0);
  });

  it("ignores a negative deposit rather than inflating the earnable amount", async () => {
    const { tx } = fakeTx(enabled);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 500, deposit: -1000 })).toBe(500);
  });

  it("applies the space's rate to the amount after the deposit comes out", async () => {
    const { tx } = fakeTx({ loyaltyEnabled: true, loyaltyPointsPerDollar: 0.5 });
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 21000, deposit: 1000 })).toBe(
      10000
    );
  });

  it("earns nothing when loyalty is switched off", async () => {
    const { tx, writes } = fakeTx({ loyaltyEnabled: false, loyaltyPointsPerDollar: 1 });
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 21000, deposit: 0 })).toBe(0);
    expect(writes.transactions).toEqual([]);
  });

  it("earns nothing when the space has no commerce settings row", async () => {
    const { tx } = fakeTx(null);
    expect(await earnLoyaltyForOrder(tx, { ...order, orderTotal: 21000, deposit: 0 })).toBe(0);
  });
});
