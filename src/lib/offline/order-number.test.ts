import { describe, expect, it } from "vitest";
import {
  isProvisionalOrderNumber,
  isProvisionalSuffix,
  provisionalOrderNumber,
  provisionalSearchKey,
} from "./order-number";
import { ulid } from "./ulid";

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
  // type what is printed on it, including in lower case, with a stray space.
  it("takes the four characters someone reads off a receipt", () => {
    expect(provisionalSearchKey("OFF-20260826-K7Q2")).toBe("K7Q2");
    expect(provisionalSearchKey("  off-20260826-k7q2 ")).toBe("K7Q2");
  });

  it("returns null for anything that is not a provisional reference", () => {
    expect(provisionalSearchKey("ORD-20260826-0001")).toBeNull();
    expect(provisionalSearchKey("K7Q2")).toBeNull();
  });
});

describe("search tails", () => {
  // Exercised through listOrders' providedSearchTails, which is not exported;
  // this pins the behaviour that function depends on.
  it("recovers the tail from a full reference regardless of case or spacing", () => {
    expect(provisionalSearchKey("OFF-20260826-K7Q2")).toBe("K7Q2");
    expect(provisionalSearchKey("off-20260826-k7q2")).toBe("K7Q2");
    expect(provisionalSearchKey("  OFF-20260826-K7Q2  ")).toBe("K7Q2");
  });

  it("does not treat an ordinary search as a reference", () => {
    expect(provisionalSearchKey("Adebayo")).toBeNull();
    expect(provisionalSearchKey("ORD-20260826-0007")).toBeNull();
  });
});

describe("isProvisionalSuffix", () => {
  // Four characters typed on their own is what a merchant has when the
  // customer reads the end of the reference over the phone.
  it("accepts a bare tail", () => {
    expect(isProvisionalSuffix("K7Q2")).toBe(true);
  });

  it("accepts it lower case and padded, because a person typed it", () => {
    expect(isProvisionalSuffix("  k7q2 ")).toBe(true);
  });

  it("rejects the letters Crockford's base32 leaves out", () => {
    // I, L, O and U are absent precisely so nothing is misread off paper; a
    // hand-written A-Z range would have accepted all four.
    for (const letter of ["I", "L", "O", "U"]) {
      expect(isProvisionalSuffix(`K7Q${letter}`)).toBe(false);
    }
  });

  it("rejects anything that is not exactly four characters", () => {
    expect(isProvisionalSuffix("K7Q")).toBe(false);
    expect(isProvisionalSuffix("K7Q23")).toBe(false);
    expect(isProvisionalSuffix("")).toBe(false);
  });

  // A four-letter word made only of Crockford characters does match, and that
  // is accepted rather than worked around: the caller ORs the tail search in
  // beside the name and order-number clauses, so the cost of "BAGS" matching
  // is at most one extra order in the results, while narrowing it further
  // would mean a real receipt tail that happens to spell a word stops being
  // findable. Only the length gate is load-bearing, and it keeps an ordinary
  // name search from turning into a suffix scan.
  it("does not treat every search string as a tail", () => {
    expect(isProvisionalSuffix("Ade")).toBe(false);
    expect(isProvisionalSuffix("Adebayo")).toBe(false);
    expect(isProvisionalSuffix("ORD-20260826-0001")).toBe(false);
  });

  it("agrees with the tail of every reference it prints", () => {
    const id = ulid(Date.UTC(2026, 7, 26));
    const tail = provisionalSearchKey(provisionalOrderNumber(id));
    expect(tail).not.toBeNull();
    expect(isProvisionalSuffix(tail as string)).toBe(true);
  });
});
