import { describe, expect, it } from "vitest";
import { isEmailVerified } from "./email-verified";

describe("isEmailVerified", () => {
  it("passes a stamped user", () => {
    expect(isEmailVerified({ app_metadata: { emailVerified: true } })).toBe(true);
  });

  /**
   * Absent must read as unverified. This is the whole reason the flag is not
   * email_confirmed_at: with autoconfirm on, that column is set at signup for
   * everybody, so a gate reading it would pass every account.
   */
  it("treats absent, false and non-boolean values as unverified", () => {
    expect(isEmailVerified({})).toBe(false);
    expect(isEmailVerified({ app_metadata: {} })).toBe(false);
    expect(isEmailVerified({ app_metadata: { emailVerified: false } })).toBe(false);
    expect(isEmailVerified({ app_metadata: { emailVerified: "true" } })).toBe(false);
  });
});
