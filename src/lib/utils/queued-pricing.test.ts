import { describe, expect, it } from "vitest";
import { ulid } from "@/lib/offline/ulid";
import {
  describeTaxVariance,
  resolveQueuedDiscount,
  saleTimeOf,
} from "./queued-pricing";

// Relative to now, because saleTimeOf refuses a receipt older than the outbox
// keeps records. A fixed date would start failing the day it aged out.
const RUNG_AT = Date.now() - 2 * 60 * 60 * 1000;
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

  // isUlid checks the shape of the string, not the sanity of the time inside
  // it, and that time is minted on the device. A receipt dated last decade is
  // not a sale still on its way.
  it("refuses a receipt older than the outbox keeps records", () => {
    const ancient = ulid(Date.UTC(2000, 0, 1));
    expect(saleTimeOf({ queuedOffline: true, clientRequestId: ancient })).toBeNull();
  });

  it("refuses a receipt from the future", () => {
    const ahead = ulid(Date.now() + 24 * 60 * 60 * 1000);
    expect(saleTimeOf({ queuedOffline: true, clientRequestId: ahead })).toBeNull();
  });

  // A till whose clock runs a minute or two fast is a real thing, and is not
  // an attack.
  it("allows a little clock skew", () => {
    const slightlyAhead = ulid(Date.now() + 60_000);
    expect(
      saleTimeOf({ queuedOffline: true, clientRequestId: slightlyAhead })
    ).not.toBeNull();
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

describe("describeTaxVariance", () => {
  const base = { queuedOffline: true, clientRequestId: RUNG, live: 150 };

  it("says nothing about a fresh order", () => {
    expect(
      describeTaxVariance({ ...base, queuedOffline: false, claimed: 0 })
    ).toBeNull();
  });

  it("says nothing when the figures agree", () => {
    expect(describeTaxVariance({ ...base, claimed: 150 })).toBeNull();
  });

  // The legitimate case — a rate changed during the outage — is reported, not
  // applied. The merchant sees it on the order and reconciles.
  it("reports a difference so a merchant can see it", () => {
    const note = describeTaxVariance({ ...base, claimed: 75 });
    expect(note).toMatch(/Receipt printed 75 tax; recorded at 150/);
  });

  // The attack the reporting-only rule exists to close: mint a fresh ULID with
  // an ancient timestamp, claim zero tax, call it an offline sync. Nothing
  // here can be made to return a figure, so the timestamp buys nothing.
  it("cannot be talked into a figure by any claim", () => {
    const backdated = ulid(Date.UTC(2000, 0, 1));
    const note = describeTaxVariance({
      ...base,
      clientRequestId: backdated,
      claimed: 0,
    });
    // Too old to be a queued sale at all, so not even worth remarking on.
    expect(note).toBeNull();
  });

  it("says nothing without a real request id", () => {
    expect(
      describeTaxVariance({ ...base, clientRequestId: undefined, claimed: 0 })
    ).toBeNull();
  });
});
