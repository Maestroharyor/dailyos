import { describe, expect, it } from "vitest";
import { customerFlags, hasAnyFlag } from "./customer-flags";

describe("customerFlags", () => {
  it("flags an email that exists and is not confirmed", () => {
    expect(customerFlags({ phone: "08012345678", verification: "unverified" })).toEqual({
      emailUnverified: true,
      missingPhone: false,
    });
  });

  it("does not flag a confirmed email", () => {
    expect(customerFlags({ phone: "08012345678", verification: "verified" }).emailUnverified).toBe(
      false
    );
  });

  /**
   * The case worth the test. Customer.email is nullable because walk-in and POS
   * customers are recorded without one. Treating "no email" as "unverified"
   * would put a warning on every row the counter staff ever created.
   */
  it("does not flag a customer who has no email at all", () => {
    expect(customerFlags({ phone: "08012345678", verification: "no-email" }).emailUnverified).toBe(
      false
    );
  });

  it("flags a missing phone, including blank and whitespace", () => {
    for (const phone of [null, "", "   "]) {
      expect(customerFlags({ phone, verification: "verified" }).missingPhone).toBe(true);
    }
  });

  it("treats a customer with both a confirmed email and a phone as complete", () => {
    expect(hasAnyFlag(customerFlags({ phone: "08012345678", verification: "verified" }))).toBe(
      false
    );
  });

  it("reports any single problem as needing attention", () => {
    expect(hasAnyFlag(customerFlags({ phone: null, verification: "verified" }))).toBe(true);
    expect(hasAnyFlag(customerFlags({ phone: "0801", verification: "unverified" }))).toBe(true);
  });
});
