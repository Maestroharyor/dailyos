import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./paystack";

/**
 * The webhook signature is the only thing standing between Paystack's
 * reconciliation events and anyone who knows the URL, so the failure modes
 * matter as much as the happy path.
 */
function sign(body: string, key: string): string {
  return crypto.createHmac("sha512", key).update(body).digest("hex");
}

const body = JSON.stringify({ event: "charge.success", data: { reference: "vkt_1" } });
const key = "sk_test_secret";

describe("verifyWebhookSignature", () => {
  it("accepts a signature produced with the same key", () => {
    expect(verifyWebhookSignature(body, sign(body, key), key)).toBe(true);
  });

  it("rejects a signature from a different key", () => {
    // This is the case that makes multi-space key resolution necessary: the
    // live space's key cannot verify the test space's events.
    expect(verifyWebhookSignature(body, sign(body, "sk_test_other"), key)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(body, key);
    const tampered = body.replace("vkt_1", "vkt_2");
    expect(verifyWebhookSignature(tampered, signature, key)).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(body, null, key)).toBe(false);
    expect(verifyWebhookSignature(body, "", key)).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    // timingSafeEqual throws on length mismatch, so the length guard has to come
    // first, a truncated header must be a rejection, not a 500.
    expect(() => verifyWebhookSignature(body, "abc123", key)).not.toThrow();
    expect(verifyWebhookSignature(body, "abc123", key)).toBe(false);
  });
});
