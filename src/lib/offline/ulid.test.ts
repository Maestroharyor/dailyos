import { describe, expect, it } from "vitest";
import { ulid, isUlid, ulidTime, ulidSuffix, MAX_ULID_TIME } from "./ulid";

describe("ulid", () => {
  it("is 26 Crockford base32 characters", () => {
    const value = ulid();
    expect(value).toHaveLength(26);
    expect(isUlid(value)).toBe(true);
  });

  // No I, L, O or U — nothing on a printed receipt reads as a different
  // character across a counter.
  it("never emits an ambiguous character", () => {
    const values = Array.from({ length: 200 }, () => ulid()).join("");
    expect(values).not.toMatch(/[ILOU]/);
  });

  it("does not repeat", () => {
    const values = new Set(Array.from({ length: 5000 }, () => ulid()));
    expect(values.size).toBe(5000);
  });

  // The property the outbox depends on: sorting the queue as strings sorts it
  // by when the cashier did the thing, so sales replay in the order rung.
  it("sorts lexicographically by time", () => {
    const early = ulid(1_000_000_000_000);
    const later = ulid(1_000_000_001_000);
    expect(early < later).toBe(true);
  });

  it("round-trips its timestamp", () => {
    const now = 1_767_225_600_000;
    expect(ulidTime(ulid(now))).toBe(now);
  });

  it("encodes the epoch and the maximum time", () => {
    expect(ulidTime(ulid(0))).toBe(0);
    expect(ulidTime(ulid(MAX_ULID_TIME))).toBe(MAX_ULID_TIME);
  });

  it("refuses a time it cannot encode rather than truncating it", () => {
    expect(() => ulid(MAX_ULID_TIME + 1)).toThrow(RangeError);
    expect(() => ulid(-1)).toThrow(RangeError);
    expect(() => ulid(Number.NaN)).toThrow(RangeError);
  });
});

describe("isUlid", () => {
  it("rejects the wrong length, lowercase, and ambiguous characters", () => {
    expect(isUlid("")).toBe(false);
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FA")).toBe(false); // 25
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FAVV")).toBe(false); // 27
    expect(isUlid("01arz3ndektsv4rrffq69g5fav")).toBe(false);
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FAI")).toBe(false);
  });

  it("accepts a well-formed one", () => {
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
  });
});

describe("ulidSuffix", () => {
  it("takes the tail a receipt prints", () => {
    expect(ulidSuffix("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("5FAV");
    expect(ulidSuffix("01ARZ3NDEKTSV4RRFFQ69G5FAV", 6)).toBe("9G5FAV");
  });
});

describe("ulidTime", () => {
  it("refuses to parse something that is not a ULID", () => {
    expect(() => ulidTime("nope")).toThrow(TypeError);
  });
});
