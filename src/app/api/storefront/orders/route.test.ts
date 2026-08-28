import { describe, expect, it } from "vitest";
import { fillableCustomerFields } from "./route";

const EXISTING = {
  phone: "+2348000000000",
  address: "12 Real Street, Lagos",
  avatarUrl: "https://cdn/real.png",
};

const BLANK = { phone: null, address: null, avatarUrl: null };

describe("fillableCustomerFields", () => {
  /**
   * The security property. This route's only credential is the space's
   * storefront key, which every visitor to the shop holds, and a bank-transfer
   * order reaches the write with no payment verification at all. Nothing proves
   * the caller owns the email they typed.
   *
   * So an order placed against a known email must not be able to replace that
   * customer's contact details in the merchant's records. Invert any of these
   * conditions and someone who knows an address can vandalise a real customer.
   */
  it("never overwrites contact details that are already set", () => {
    const fills = fillableCustomerFields(EXISTING, {
      phone: "+2349999999999",
      address: "Attacker Road",
      avatarUrl: "https://evil/x.png",
    });

    expect(fills).toEqual({});
  });

  it("fills details the merchant does not have yet", () => {
    const fills = fillableCustomerFields(BLANK, {
      phone: "+2348111111111",
      address: "5 New Road, Ikeja",
      avatarUrl: "https://cdn/avatar.png",
    });

    expect(fills).toEqual({
      phone: "+2348111111111",
      address: "5 New Road, Ikeja",
      avatarUrl: "https://cdn/avatar.png",
    });
  });

  it("fills each field independently", () => {
    const fills = fillableCustomerFields(
      { phone: "+2348000000000", address: null, avatarUrl: null },
      { phone: "+2349999999999", address: "5 New Road, Ikeja" }
    );

    expect(fills).toEqual({ address: "5 New Road, Ikeja" });
  });

  it("treats an empty string as nothing to write", () => {
    expect(fillableCustomerFields(BLANK, { phone: "", address: "", avatarUrl: "" })).toEqual({});
  });

  it("writes nothing when the order carries no contact details", () => {
    expect(fillableCustomerFields(BLANK, {})).toEqual({});
  });
});
