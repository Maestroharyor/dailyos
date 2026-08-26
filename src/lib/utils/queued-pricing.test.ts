import { describe, expect, it } from "vitest";
import { ulid } from "@/lib/offline/ulid";
import {
  resolveQueuedDiscount,
  resolveQueuedTax,
  saleTimeOf,
} from "./queued-pricing";

const RUNG_AT = Date.UTC(2026, 7, 26, 9, 0, 0);
const RUNG = ulid(RUNG_AT);

describe("saleTimeOf", () => {
  it("reads the sale time out of the request id", () => {
    expect(saleTimeOf({ queuedOffline: true, clientRequestId: RUNG })?.getTime()).toBe(
      RUNG_AT
    );
  });

  it("has no sale time for a fresh order", () => {
    expect(saleTimeOf({ queuedOffline: false, clientRequestId: RUNG })).toBeNull();
  });

  // Everything the receipt is allowed to claim hangs off this, so a request id
  // that is not a real ULID buys nothing.
  it("has no sale time without a real request id", () => {
    expect(saleTimeOf({ queuedOffline: true, clientRequestId: null })).toBeNull();
    expect(saleTimeOf({ queuedOffline: true, clientRequestId: "" })).toBeNull();
    expect(
      saleTimeOf({ queuedOffline: true, clientRequestId: "not-a-ulid" })
    ).toBeNull();
  });
});

describe("resolveQueuedDiscount", () => {
  const base = {
    queuedOffline: true,
    clientRequestId: RUNG,
    code: "SAVE10",
    ceiling: 500,
  };

  it("prices a fresh order from the server, whatever the client claims", () => {
    const out = resolveQueuedDiscount({
      ...base,
      queuedOffline: false,
      claimed: 500,
      serverAmount: 0,
    });
    expect(out.amount).toBe(0);
    expect(out.note).toBeNull();
  });

  // The legitimate case: the code was valid at the till, has since been spent
  // or expired, and the customer walked out with a printed receipt. Zeroing it
  // would record more money than was taken.
  it("honours a receipt whose code has since become invalid", () => {
    const out = resolveQueuedDiscount({ ...base, claimed: 500, serverAmount: 0 });
    expect(out.amount).toBe(500);
    expect(out.note).toMatch(/kept at 500 from the printed receipt/);
  });

  it("says nothing when the code still gives the same answer", () => {
    const out = resolveQueuedDiscount({ ...base, claimed: 500, serverAmount: 500 });
    expect(out.amount).toBe(500);
    expect(out.note).toBeNull();
  });

  // The attack: createOrder is reachable by any account with edit_orders, and
  // "queuedOffline" is the client's word. Without the ceiling this is a
  // write-your-own-discount endpoint.
  it("refuses a claim larger than the code could ever give", () => {
    const out = resolveQueuedDiscount({ ...base, claimed: 5000, serverAmount: 0 });
    expect(out.amount).toBe(0);
    expect(out.note).toMatch(/more than that code can give/);
  });

  it("refuses a claim on a code that does not exist, whose ceiling is zero", () => {
    const out = resolveQueuedDiscount({
      ...base,
      ceiling: 0,
      claimed: 500,
      serverAmount: 0,
    });
    expect(out.amount).toBe(0);
  });

  it("refuses a claim without a real request id, however plausible", () => {
    const out = resolveQueuedDiscount({
      ...base,
      clientRequestId: "totally-legitimate",
      claimed: 500,
      serverAmount: 0,
    });
    expect(out.amount).toBe(0);
    expect(out.note).toBeNull();
  });

  // A claim that fails its bound still records the sale. The cash is in the
  // drawer; dropping the order would lose it.
  it("never refuses the sale itself", () => {
    const out = resolveQueuedDiscount({ ...base, claimed: 99999, serverAmount: 250 });
    expect(out.amount).toBe(250);
  });
});

describe("resolveQueuedTax", () => {
  const changedAfter = new Date(RUNG_AT + 60_000);
  const changedBefore = new Date(RUNG_AT - 60_000);
  const base = { queuedOffline: true, clientRequestId: RUNG, live: 150 };

  it("leaves a fresh order to the live rate", () => {
    const out = resolveQueuedTax({
      ...base,
      queuedOffline: false,
      claimed: 0,
      settingsUpdatedAt: changedAfter,
    });
    expect(out.agreedTax).toBeUndefined();
    expect(out.note).toBeNull();
  });

  it("says nothing when the figures agree", () => {
    const out = resolveQueuedTax({
      ...base,
      claimed: 150,
      settingsUpdatedAt: changedAfter,
    });
    expect(out.agreedTax).toBeUndefined();
    expect(out.note).toBeNull();
  });

  // The legitimate case: the merchant changed the rate during the outage.
  it("honours the receipt when the settings moved after the sale", () => {
    const out = resolveQueuedTax({
      ...base,
      claimed: 75,
      settingsUpdatedAt: changedAfter,
    });
    expect(out.agreedTax).toBe(75);
    expect(out.note).toMatch(/kept at 75 from the printed receipt/);
  });

  // The attack: shave the tax line and call it an offline sync.
  // CommerceSettings.updatedAt is server-written and cannot be forged from a
  // request payload, which is the whole reason the check is on that field.
  it("refuses when the settings have not moved since the sale", () => {
    const out = resolveQueuedTax({
      ...base,
      claimed: 0,
      settingsUpdatedAt: changedBefore,
    });
    expect(out.agreedTax).toBeUndefined();
    expect(out.note).toMatch(/settings have not changed/);
  });

  it("refuses when there are no settings to have moved", () => {
    const out = resolveQueuedTax({ ...base, claimed: 0, settingsUpdatedAt: null });
    expect(out.agreedTax).toBeUndefined();
  });

  it("refuses a claim without a real request id", () => {
    const out = resolveQueuedTax({
      ...base,
      clientRequestId: undefined,
      claimed: 0,
      settingsUpdatedAt: changedAfter,
    });
    expect(out.agreedTax).toBeUndefined();
    expect(out.note).toBeNull();
  });

  it("refuses a negative claim even when the settings did move", () => {
    const out = resolveQueuedTax({
      ...base,
      claimed: -50,
      settingsUpdatedAt: changedAfter,
    });
    expect(out.agreedTax).toBeUndefined();
    expect(out.note).toMatch(/not a figure/);
  });
});
