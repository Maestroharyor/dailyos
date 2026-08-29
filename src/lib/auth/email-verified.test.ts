import { describe, expect, it } from "vitest";
import { isEmailVerified } from "./email-verified";

const GOOGLE = "google";

function googleIdentity(overrides: Record<string, unknown> = {}) {
  return {
    provider: GOOGLE,
    identity_data: { email: "merchant@gmail.com", email_verified: true, ...overrides },
  };
}

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

  it("passes a Google identity that asserts the same address, with no flag", () => {
    expect(isEmailVerified({ email: "merchant@gmail.com", identities: [googleIdentity()] })).toBe(
      true
    );
  });

  it("ignores case when matching the identity address to the account", () => {
    expect(
      isEmailVerified({
        email: "Merchant@Gmail.com",
        identities: [googleIdentity({ email: "merchant@GMAIL.com" })],
      })
    ).toBe(true);
  });

  it("rejects a provider that declines to assert the address", () => {
    expect(
      isEmailVerified({
        email: "merchant@gmail.com",
        identities: [googleIdentity({ email_verified: false })],
      })
    ).toBe(false);
    expect(
      isEmailVerified({
        email: "merchant@gmail.com",
        identities: [googleIdentity({ email_verified: undefined })],
      })
    ).toBe(false);
  });

  /**
   * The regression guard for the autoconfirm hole.
   *
   * GoTrue's own email identity carries email_verified, and autoconfirm sets it
   * at signup exactly as it sets email_confirmed_at. Without this case the
   * provider branch quietly re-opens the problem the whole module exists to
   * avoid, under a different field name.
   */
  it("never trusts GoTrue's own email identity, however it is stamped", () => {
    expect(
      isEmailVerified({
        email: "merchant@gmail.com",
        identities: [
          {
            provider: "email",
            identity_data: { email: "merchant@gmail.com", email_verified: true },
          },
        ],
      })
    ).toBe(false);
  });

  /**
   * Proving one address must not vouch for another. A linked identity for a
   * different verified address would otherwise be a way past the gate.
   */
  it("rejects an identity whose address is not the account's", () => {
    expect(
      isEmailVerified({
        email: "merchant@dailyos.test",
        identities: [googleIdentity()],
      })
    ).toBe(false);
  });

  it("rejects an identity with no address at all", () => {
    expect(
      isEmailVerified({
        email: "merchant@gmail.com",
        identities: [googleIdentity({ email: undefined })],
      })
    ).toBe(false);
  });

  it("rejects a provider identity when the account itself has no address", () => {
    expect(isEmailVerified({ identities: [googleIdentity()] })).toBe(false);
    expect(isEmailVerified({ email: null, identities: [googleIdentity()] })).toBe(false);
  });

  it("handles absent and empty identity lists", () => {
    expect(isEmailVerified({ email: "merchant@gmail.com" })).toBe(false);
    expect(isEmailVerified({ email: "merchant@gmail.com", identities: null })).toBe(false);
    expect(isEmailVerified({ email: "merchant@gmail.com", identities: [] })).toBe(false);
  });

  it("takes the stamp even when the identities disagree", () => {
    expect(
      isEmailVerified({
        email: "merchant@gmail.com",
        app_metadata: { emailVerified: true },
        identities: [googleIdentity({ email_verified: false })],
      })
    ).toBe(true);
  });
});
