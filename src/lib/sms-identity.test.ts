import { describe, expect, it } from "vitest";
import { SMS_IDENTITY_FIELDS, smsUnverifies } from "./sms-identity";

const stored = {
  provider: "termii",
  senderId: "VKTBougie",
  apiBaseUrl: "https://api.ng.termii.com",
  apiKey: "v1:stored",
  useDndRoute: true,
};

describe("smsUnverifies", () => {
  it("says no when nothing has been proven yet", () => {
    expect(smsUnverifies(null, { senderId: "Anything" })).toBe(false);
  });

  it("says no when a save resubmits identical values", () => {
    // The card submits every field on every save. Presence alone would make
    // pressing Save twice drop a merchant back to the platform sender while the
    // badge still read green.
    expect(smsUnverifies(stored, { ...stored })).toBe(false);
  });

  it("says yes for a changed sender ID", () => {
    expect(smsUnverifies(stored, { senderId: "Different" })).toBe(true);
  });

  it("says yes for a changed base URL", () => {
    // Termii issues one per account, so a different region is a different
    // account and the old test proves nothing about it.
    expect(smsUnverifies(stored, { apiBaseUrl: "https://api.eu.termii.com" })).toBe(true);
  });

  it("says yes when the DND route is flipped", () => {
    // A sender ID can be approved for generic and still waiting on DND
    // whitelisting, so a test that passed on one proves nothing about the other.
    expect(smsUnverifies(stored, { useDndRoute: false })).toBe(true);
  });

  it("says yes when a new credential is typed, because ciphertext never matches", () => {
    expect(smsUnverifies(stored, { apiKey: "v1:freshly-encrypted" })).toBe(true);
  });

  it("ignores fields that change who gets messages rather than whether we can send", () => {
    expect(
      smsUnverifies(stored, {
        ...stored,
        // Not identity fields, so none of these clear a verification.
        notifyMerchant: true,
        merchantPhone: "+2348035550100",
        monthlyCapAmount: 5000,
      } as Record<string, unknown>)
    ).toBe(false);
  });

  it("covers every identity field", () => {
    for (const field of SMS_IDENTITY_FIELDS) {
      expect(smsUnverifies(stored, { [field]: "changed" })).toBe(true);
    }
  });
});
