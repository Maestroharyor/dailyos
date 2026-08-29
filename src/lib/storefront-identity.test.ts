import { describe, expect, it } from "vitest";
import { type IdentityResult, orderIdentityGate } from "./storefront-identity";

const identified = (email: string, emailVerified = true): IdentityResult => ({
  kind: "identified",
  identity: { userId: "u1", email, emailVerified },
});

describe("orderIdentityGate", () => {
  /**
   * The case worth writing first. Guest checkout is open by design, and a
   * version of this that read "no token" as "not verified" would end guest
   * ordering silently, while every test about signed-in shoppers still passed.
   */
  it("lets a caller with no token through as a guest", () => {
    expect(orderIdentityGate({ kind: "anonymous" }, "guest@example.com")).toEqual({
      kind: "guest",
    });
    expect(orderIdentityGate({ kind: "anonymous" }, null)).toEqual({ kind: "guest" });
  });

  /**
   * A token that was offered and failed is not the same as no token. Folding
   * the two together would make the check bypassable by mangling the header,
   * which is the usual way this kind of gate is defeated.
   */
  it("refuses a token that did not verify rather than treating it as a guest", () => {
    const gate = orderIdentityGate({ kind: "invalid" }, "someone@example.com");

    expect(gate.kind).toBe("reject");
    expect(gate).toMatchObject({ status: 401 });
  });

  it("identifies a verified shopper when the session and the form agree", () => {
    expect(orderIdentityGate(identified("ada@example.com"), "ada@example.com")).toEqual({
      kind: "identified",
      email: "ada@example.com",
    });
  });

  /**
   * Read from the token, not from a Customer row.
   *
   * A row-based check would reject a first-time buyer, who has no row in this
   * space yet, even though the storefront's pre-payment gate had already waved
   * them through on the same flag - and by the time this route runs, Paystack
   * has charged them.
   */
  it("refuses a signed-in shopper whose address is not verified", () => {
    const gate = orderIdentityGate(identified("ada@example.com", false), "ada@example.com");

    expect(gate.kind).toBe("reject");
    expect(gate).toMatchObject({ status: 403 });
  });

  // The token is the identity; the body is a form field the shopper can retype.
  it("matches case-insensitively, because only the merchant side stores mixed case", () => {
    expect(orderIdentityGate(identified("ada@example.com"), "  Ada@Example.COM  ")).toEqual({
      kind: "identified",
      email: "ada@example.com",
    });
  });

  it("refuses an order whose email is not the signed-in one", () => {
    const gate = orderIdentityGate(identified("ada@example.com"), "someone.else@example.com");

    expect(gate.kind).toBe("reject");
    expect(gate).toMatchObject({ status: 403 });
  });

  /**
   * A signed-in shopper who leaves the address blank is still that account: the
   * token decides, so there is nothing to disagree with and the gate proceeds
   * to the verification check rather than falling through to the guest path.
   */
  it("uses the token's address when the body carries none", () => {
    expect(orderIdentityGate(identified("ada@example.com"), null)).toEqual({
      kind: "identified",
      email: "ada@example.com",
    });
    expect(orderIdentityGate(identified("ada@example.com"), "   ")).toEqual({
      kind: "identified",
      email: "ada@example.com",
    });
  });
});
