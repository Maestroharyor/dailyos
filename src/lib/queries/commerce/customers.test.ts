import { describe, expect, it } from "vitest";
import { type Customer, mergeCustomerEdit } from "./customers";

/**
 * The optimistic window. `input` carries no verification field, so a plain
 * spread leaves whatever the row already said, and the server clears the stamp
 * whenever the address moves - so the cache would contradict it for a round
 * trip, showing a verified badge for an address nobody has proved.
 */
const VERIFIED: Customer = {
  id: "c1",
  spaceId: "s1",
  name: "Ada",
  email: "ada@example.com",
  phone: "08012345678",
  address: null,
  avatarUrl: null,
  notes: null,
  loyaltyPoints: 0,
  storeCredit: 0,
  birthDate: null,
  tags: [],
  emailVerification: "verified",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as Customer;

describe("mergeCustomerEdit", () => {
  it("drops the badge when the address moves", () => {
    const merged = mergeCustomerEdit(VERIFIED, { email: "grace@example.com" });

    expect(merged.email).toBe("grace@example.com");
    expect(merged.emailVerification).toBeUndefined();
  });

  /**
   * The other direction matters as much. The customer form submits every field,
   * so blanking on presence alone would strip the badge every time a merchant
   * edited a phone number.
   */
  it("keeps it when the address is unchanged, however it was typed", () => {
    expect(mergeCustomerEdit(VERIFIED, { email: "ada@example.com" }).emailVerification).toBe(
      "verified"
    );
    expect(mergeCustomerEdit(VERIFIED, { email: "  Ada@Example.COM  " }).emailVerification).toBe(
      "verified"
    );
  });

  it("keeps it when the edit does not touch the address at all", () => {
    const merged = mergeCustomerEdit(VERIFIED, { phone: "08099999999" });

    expect(merged.phone).toBe("08099999999");
    expect(merged.emailVerification).toBe("verified");
  });

  // Removing the address is a change like any other, and "no-email" is the
  // server's answer for it rather than something to guess at here.
  it("drops the badge when the address is removed", () => {
    expect(mergeCustomerEdit(VERIFIED, { email: "" }).emailVerification).toBeUndefined();
  });

  it("still applies the rest of the edit", () => {
    const merged = mergeCustomerEdit(VERIFIED, { name: "Ada L", email: "grace@example.com" });

    expect(merged.name).toBe("Ada L");
    expect(merged.id).toBe("c1");
  });
});
