import { describe, expect, it } from "vitest";
import { unverifies } from "./email-identity";

const STORED = {
  provider: "resend",
  fromName: "VKT Bougie",
  fromAddress: "hello@vktbougie.com",
  resendApiKey: "v1:iv:tag:ciphertext",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
};

describe("unverifies", () => {
  it("holds verification when a save resubmits identical values", () => {
    // The regression this exists for: the settings card posts every field on
    // every save, so a merchant pressing Save twice used to lose a passing test
    // and drop back to the platform sender without being told.
    expect(unverifies(STORED, { ...STORED })).toBe(false);
  });

  it("clears verification when the from-address moves to another domain", () => {
    expect(unverifies(STORED, { ...STORED, fromAddress: "hi@example.com" })).toBe(true);
  });

  it("clears verification when the provider changes", () => {
    expect(unverifies(STORED, { ...STORED, provider: "smtp" })).toBe(true);
  });

  it("clears verification when a new credential is typed", () => {
    // Ciphertext differs on every encrypt, so a submitted key always re-proves.
    expect(unverifies(STORED, { resendApiKey: "v1:iv2:tag2:ciphertext2" })).toBe(true);
  });

  it("clears verification when a stored credential is cleared", () => {
    expect(unverifies(STORED, { resendApiKey: "" })).toBe(true);
  });

  it("holds verification when an untouched credential is omitted", () => {
    expect(unverifies(STORED, { fromName: STORED.fromName })).toBe(false);
  });

  it("ignores fields a test send never proved", () => {
    // replyTo is cosmetic: it rides on a transport the test already exercised.
    expect(unverifies(STORED, { replyTo: "support@vktbougie.com" } as never)).toBe(false);
  });

  it("distinguishes a port change from an unchanged port", () => {
    expect(unverifies(STORED, { smtpPort: 587 })).toBe(false);
    expect(unverifies(STORED, { smtpPort: 465 })).toBe(true);
  });

  it("treats a first-time configuration as nothing to invalidate", () => {
    expect(unverifies(null, { ...STORED })).toBe(false);
  });
});
