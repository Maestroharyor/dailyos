import { describe, expect, it } from "vitest";
import { FCT, NIGERIA_STATES, normalizeState, statesMatch } from "./states";

/**
 * The normaliser decides whether a delivery option belongs to the address an
 * order is going to, so a wrong answer here is an order shipped across the
 * country at a local fee. Null beats a guess in every case below.
 */
describe("normalizeState", () => {
  it("covers the 36 states and the FCT", () => {
    expect(NIGERIA_STATES).toHaveLength(37);
    expect(new Set(NIGERIA_STATES).size).toBe(37);
  });

  it("passes a canonical name through", () => {
    expect(normalizeState("Lagos")).toBe("Lagos");
    expect(normalizeState(FCT)).toBe(FCT);
  });

  it("ignores case, padding and punctuation", () => {
    expect(normalizeState("  lagos  ")).toBe("Lagos");
    expect(normalizeState("CROSS-RIVER")).toBe("Cross River");
    expect(normalizeState("akwa  ibom")).toBe("Akwa Ibom");
  });

  it("drops a trailing 'state'", () => {
    expect(normalizeState("Ogun State")).toBe("Ogun");
    expect(normalizeState("kano state")).toBe("Kano");
  });

  it("resolves every name the FCT answers to", () => {
    for (const raw of ["FCT", "fct", "Abuja", "F.C.T.", "FCT Abuja", "Abuja (FCT)"]) {
      expect(normalizeState(raw)).toBe(FCT);
    }
  });

  /** The storefront's own legacy price table spelled this one wrong. */
  it("corrects Nassarawa", () => {
    expect(normalizeState("Nassarawa")).toBe("Nasarawa");
  });

  it("returns null rather than guessing", () => {
    expect(normalizeState("Lagoss")).toBeNull();
    expect(normalizeState("Ghana")).toBeNull();
    expect(normalizeState("362262")).toBeNull();
    expect(normalizeState("")).toBeNull();
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState(undefined)).toBeNull();
  });

  /**
   * A saved storefront address is split out of a comma-joined string, and the
   * third field is often the postcode rather than the state. Seeding a picker
   * from that must produce nothing, not a wrong state.
   */
  it("returns null for a postcode picked out of a saved address", () => {
    expect(normalizeState("122, Dgsgs, 362262, Nigeria".split(",")[2])).toBeNull();
  });
});

describe("statesMatch", () => {
  it("matches across spellings", () => {
    expect(statesMatch("abuja", FCT)).toBe(true);
    expect(statesMatch("Ogun State", "ogun")).toBe(true);
  });

  it("does not match different states", () => {
    expect(statesMatch("Lagos", "Kano")).toBe(false);
  });

  it("is false when either side is unrecognised", () => {
    expect(statesMatch("Lagos", "Lagoss")).toBe(false);
    expect(statesMatch(null, "Lagos")).toBe(false);
    expect(statesMatch("", "")).toBe(false);
  });
});
