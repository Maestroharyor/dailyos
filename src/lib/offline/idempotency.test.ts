import { describe, expect, it } from "vitest";
import {
  createIdempotently,
  isClientRequestIdConflict,
  isUniqueViolation,
  uniqueViolationFields,
} from "./idempotency";

/** Shaped like the error Prisma throws, without importing the client. */
function uniqueError(target: unknown) {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target },
  });
}

describe("isUniqueViolation", () => {
  it("recognises P2002", () => {
    expect(isUniqueViolation(uniqueError(["orderNumber"]))).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("P2002")).toBe(false);
    expect(isUniqueViolation({ code: 2002 })).toBe(false);
  });
});

describe("uniqueViolationFields", () => {
  // The shape has moved between Prisma versions and adapters, so all of these
  // are normalised rather than trusted.
  it("normalises an array, a string, and a missing target", () => {
    expect(uniqueViolationFields(uniqueError(["spaceId", "clientRequestId"]))).toEqual([
      "spaceId",
      "clientRequestId",
    ]);
    expect(uniqueViolationFields(uniqueError("orders_spaceId_clientRequestId_key"))).toEqual([
      "orders_spaceId_clientRequestId_key",
    ]);
    expect(uniqueViolationFields(uniqueError(undefined))).toEqual([]);
    expect(uniqueViolationFields(uniqueError(null))).toEqual([]);
  });

  it("drops non-string members rather than stringifying them", () => {
    expect(uniqueViolationFields(uniqueError(["spaceId", 7, null]))).toEqual(["spaceId"]);
  });

  it("is empty for a non-Prisma error", () => {
    expect(uniqueViolationFields(new Error("boom"))).toEqual([]);
  });
});

describe("isClientRequestIdConflict", () => {
  // This is the distinction the whole file exists for. An orderNumber
  // collision must retry with a fresh number; a clientRequestId collision must
  // NOT, because retrying there is how one sale becomes two orders.
  it("separates an idempotency-key collision from an order-number one", () => {
    expect(isClientRequestIdConflict(uniqueError(["spaceId", "clientRequestId"]))).toBe(true);
    expect(isClientRequestIdConflict(uniqueError(["spaceId", "orderNumber"]))).toBe(false);
  });

  it("recognises the constraint name as well as the column list", () => {
    expect(
      isClientRequestIdConflict(uniqueError("orders_spaceId_clientRequestId_key"))
    ).toBe(true);
  });

  it("recognises the standalone movement index", () => {
    expect(isClientRequestIdConflict(uniqueError(["clientRequestId"]))).toBe(true);
  });

  it("is false when the target is missing — an unknown index is not a replay", () => {
    expect(isClientRequestIdConflict(uniqueError(undefined))).toBe(false);
  });

  it("is false for a non-unique error even if the message mentions the column", () => {
    expect(
      isClientRequestIdConflict(new Error("clientRequestId went wrong somehow"))
    ).toBe(false);
  });

  it("does not confuse paymentReference with the idempotency key", () => {
    expect(isClientRequestIdConflict(uniqueError(["spaceId", "paymentReference"]))).toBe(false);
  });
});

describe("createIdempotently", () => {
  const ROW = { id: "row-1" };

  function conflict(fields: string[]) {
    return Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: fields },
    });
  }

  it("creates when there is no key to recognise a replay by", async () => {
    let created = 0;
    const out = await createIdempotently({
      clientRequestId: null,
      find: async () => {
        throw new Error("must not look without a key");
      },
      create: async () => {
        created++;
        return ROW;
      },
    });
    expect(out).toEqual({ row: ROW, replayed: false });
    expect(created).toBe(1);
  });

  it("returns the existing row without creating a second one", async () => {
    let created = 0;
    const out = await createIdempotently({
      clientRequestId: "KEY",
      find: async () => ROW,
      create: async () => {
        created++;
        return ROW;
      },
    });
    expect(out).toEqual({ row: ROW, replayed: true });
    expect(created).toBe(0);
  });

  // The race: two tabs drain the same queued create at once. The loser must
  // land on the winner's row, not report a failure the caller cannot act on.
  it("recovers the winner's row when it loses a race on the key", async () => {
    let found = 0;
    const out = await createIdempotently({
      clientRequestId: "KEY",
      find: async () => (found++ === 0 ? null : ROW),
      create: async () => {
        throw conflict(["spaceId", "clientRequestId"]);
      },
    });
    expect(out).toEqual({ row: ROW, replayed: true });
  });

  // A duplicate SKU is a real refusal a merchant has to see and fix.
  it("rethrows a unique violation on any other column", async () => {
    await expect(
      createIdempotently({
        clientRequestId: "KEY",
        find: async () => null,
        create: async () => {
          throw conflict(["spaceId", "sku"]);
        },
      })
    ).rejects.toThrow("Unique constraint failed");
  });

  it("rethrows a key conflict that leaves nothing to find, rather than inventing a row", async () => {
    await expect(
      createIdempotently({
        clientRequestId: "KEY",
        find: async () => null,
        create: async () => {
          throw conflict(["clientRequestId"]);
        },
      })
    ).rejects.toThrow("Unique constraint failed");
  });

  it("rethrows an ordinary failure untouched", async () => {
    await expect(
      createIdempotently({
        clientRequestId: "KEY",
        find: async () => null,
        create: async () => {
          throw new Error("connection lost");
        },
      })
    ).rejects.toThrow("connection lost");
  });
});
