import { describe, expect, it } from "vitest";
import { ulid } from "./ulid";
import {
  provisionalOrderNumber,
  isProvisionalOrderNumber,
  provisionalSearchKey,
} from "./order-number";

const AT = Date.UTC(2026, 7, 26, 13, 30);

describe("provisionalOrderNumber", () => {
  it("dates the reference from the request's own id", () => {
    expect(provisionalOrderNumber(ulid(AT))).toMatch(/^OFF-20260826-[0-9A-Z]{4}$/);
  });

  // The one rule that cannot bend: a provisional reference must never be
  // mistakable for the real order number the server assigns at sync.
  it("never emits an ORD- prefix", () => {
    for (let i = 0; i < 200; i++) {
      expect(provisionalOrderNumber(ulid())).not.toMatch(/^ORD-/);
    }
  });

  it("is stable for one request id", () => {
    const id = ulid(AT);
    expect(provisionalOrderNumber(id)).toBe(provisionalOrderNumber(id));
  });

  it("differs between two sales rung in the same second", () => {
    const a = provisionalOrderNumber(ulid(AT));
    const b = provisionalOrderNumber(ulid(AT));
    // 4 characters of a 32-symbol alphabet: a clash is ~1 in a million, and a
    // clash is a search that returns two orders, not a lost sale.
    expect(a.slice(0, 13)).toBe(b.slice(0, 13));
  });

  it("refuses anything that is not a ULID", () => {
    expect(() => provisionalOrderNumber("ORD-20260826-0001")).toThrow(TypeError);
    expect(() => provisionalOrderNumber("")).toThrow(TypeError);
  });

  it("pads single-digit months and days", () => {
    expect(provisionalOrderNumber(ulid(Date.UTC(2026, 0, 5)))).toContain("-20260105-");
  });
});

describe("isProvisionalOrderNumber", () => {
  it("recognises its own output and nothing else", () => {
    expect(isProvisionalOrderNumber(provisionalOrderNumber(ulid(AT)))).toBe(true);
    expect(isProvisionalOrderNumber("ORD-20260826-0001")).toBe(false);
    expect(isProvisionalOrderNumber("OFF-20260826-K7Q")).toBe(false);
    expect(isProvisionalOrderNumber("")).toBe(false);
  });

  it("rejects the ambiguous characters the alphabet excludes", () => {
    expect(isProvisionalOrderNumber("OFF-20260826-ILOU")).toBe(false);
  });
});

describe("provisionalSearchKey", () => {
  // The paper in the customer's hand is the only link between the provisional
  // reference and the real order number, so the merchant has to be able to
  // type what is printed on it — including in lower case, with a stray space.
  it("takes the four characters someone reads off a receipt", () => {
    expect(provisionalSearchKey("OFF-20260826-K7Q2")).toBe("K7Q2");
    expect(provisionalSearchKey("  off-20260826-k7q2 ")).toBe("K7Q2");
  });

  it("returns null for anything that is not a provisional reference", () => {
    expect(provisionalSearchKey("ORD-20260826-0001")).toBeNull();
    expect(provisionalSearchKey("K7Q2")).toBeNull();
  });
});
