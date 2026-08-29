import { describe, expect, it } from "vitest";
import { isExempt, isVerified, verifyEmailQuery } from "./middleware";

/**
 * The two decisions the merchant gate makes. Both are one character from being
 * inverted, and both fail quietly: too strict and every merchant is locked out
 * of their own dashboard, too loose and the gate does nothing at all.
 */
describe("isExempt", () => {
  /**
   * The loop. /verify-email is where the gate sends people, so if it is not
   * exempt the redirect targets itself and the browser gives up.
   */
  it("exempts the page the gate redirects to", () => {
    expect(isExempt("/verify-email")).toBe(true);
  });

  // Someone must always be able to sign out and use a different account.
  it("exempts the auth pages and the OAuth callback", () => {
    for (const path of ["/login", "/signup", "/reset-password", "/auth/callback"]) {
      expect(isExempt(path)).toBe(true);
    }
  });

  /**
   * API routes answer with status codes, not pages. Redirecting a fetch to
   * HTML turns a clean response into a JSON parse error at the call site -
   * including on /api/auth/verify-email, which is the call that clears the
   * gate, so gating it would make verification impossible.
   */
  it("exempts API routes, including the one that clears the gate", () => {
    expect(isExempt("/api/auth/verify-email")).toBe(true);
    expect(isExempt("/api/spaces")).toBe(true);
  });

  it("gates the dashboard and every module behind it", () => {
    for (const path of ["/home", "/commerce/orders", "/finance", "/onboarding", "/settings"]) {
      expect(isExempt(path)).toBe(false);
    }
  });

  /**
   * Prefix matching has to respect the segment boundary, or an exemption for
   * /login would also exempt anything merely starting with those letters.
   */
  it("matches whole segments, not string prefixes", () => {
    expect(isExempt("/login/extra")).toBe(true);
    expect(isExempt("/loginsomething")).toBe(false);
    expect(isExempt("/apifoo")).toBe(false);
  });
});

describe("isVerified", () => {
  it("passes a stamped user", () => {
    expect(isVerified({ app_metadata: { emailVerified: true } })).toBe(true);
  });

  /**
   * Absent must read as unverified. This is the whole reason the flag is not
   * email_confirmed_at: with autoconfirm on, that column is set at signup for
   * everybody, so a gate reading it would pass every account.
   */
  it("treats absent, false and non-boolean values as unverified", () => {
    expect(isVerified({})).toBe(false);
    expect(isVerified({ app_metadata: {} })).toBe(false);
    expect(isVerified({ app_metadata: { emailVerified: false } })).toBe(false);
    expect(isVerified({ app_metadata: { emailVerified: "true" } })).toBe(false);
  });
});

describe("verifyEmailQuery", () => {
  /**
   * The bug this replaced simply cleared the query string, which was invisible
   * for signup (it builds its own /verify-email URL) and silently broke the
   * case that matters: a merchant with an existing unverified session opening
   * an invite deep link. /invite/[token] is deliberately not exempt, so losing
   * the token dropped them on /home after verifying, with the invite gone.
   */
  it("carries a deep link, query string and all, through verification", () => {
    const query = verifyEmailQuery("/invite/abc123?ref=email", "merchant@example.com");
    const params = new URLSearchParams(query);

    expect(params.get("callbackUrl")).toBe("/invite/abc123?ref=email");
    expect(params.get("email")).toBe("merchant@example.com");
  });

  // The page falls back to the address in the URL when there is no session user
  // to read one from, so an absent email must not become the string "null".
  it("omits the email rather than passing an empty one", () => {
    const params = new URLSearchParams(verifyEmailQuery("/home", null));

    expect(params.has("email")).toBe(false);
    expect(params.get("callbackUrl")).toBe("/home");
  });
});
