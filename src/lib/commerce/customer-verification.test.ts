import { describe, expect, it } from "vitest";
import { emailVerification } from "./customer-verification";

/**
 * These used to mock a raw query against auth.users. They no longer need to:
 * verification is a column on the customer row, so this is a pure function and
 * the tests are about the three states rather than about a database.
 */
describe("emailVerification", () => {
  it("reports a stamped customer as verified", () => {
    expect(
      emailVerification({ email: "ada@example.com", emailVerifiedAt: new Date("2026-08-01") })
    ).toBe("verified");
  });

  it("reports an unstamped customer as unverified", () => {
    expect(emailVerification({ email: "ada@example.com", emailVerifiedAt: null })).toBe(
      "unverified"
    );
  });

  /**
   * The case worth the test. Customer.email is nullable because walk-in and POS
   * sales are recorded without one, and calling those "unverified" would put a
   * warning on every row the counter staff ever created.
   */
  it("separates a customer with no email from an unverified one", () => {
    expect(emailVerification({ email: null, emailVerifiedAt: null })).toBe("no-email");
    expect(emailVerification({ email: "   ", emailVerifiedAt: null })).toBe("no-email");
    expect(emailVerification({ email: "ada@example.com", emailVerifiedAt: null })).toBe(
      "unverified"
    );
  });

  /**
   * A stamp with no address left on the row is contradictory, and the honest
   * answer is the one that does not put a warning chip on a walk-in record.
   */
  it("treats a stamp with no address as no-email rather than verified", () => {
    expect(emailVerification({ email: null, emailVerifiedAt: new Date() })).toBe("no-email");
  });
});
