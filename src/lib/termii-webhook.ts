import crypto from "node:crypto";
import { decryptSecret } from "./crypto";
import { prisma } from "./db";

// Verification for Termii delivery receipts.
//
// Split out of the route so it can be tested: a "use server" module or a route
// handler cannot be, and this is the one piece where getting it wrong means
// accepting forged delivery reports.

/**
 * Termii signs with HMAC-SHA512 over the raw body, using the account's *secret
 * key* — a different credential from the API key that authenticates sends.
 * Header is X-Termii-Signature.
 */
export function verifyTermiiSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string
): boolean {
  if (!signature || !secretKey) return false;

  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type TermiiSignerResult =
  | { ok: true; spaceId: string | null }
  | { ok: false; reason: "unconfigured" | "invalid" };

/**
 * Finds which space's secret signed this payload.
 *
 * Termii sends no space identifier, so the signature is the identifier. Tries
 * every space with a webhook secret, then the platform key, exactly as the
 * Paystack route resolves its signer — and for the same reason: a staging space
 * configured alongside the live one must not break verification for real
 * traffic.
 */
export async function resolveTermiiSigner(
  rawBody: string,
  signature: string | null
): Promise<TermiiSignerResult> {
  const spaces = await prisma.spaceSmsSettings.findMany({
    where: { webhookSecret: { not: "" } },
    select: { spaceId: true, webhookSecret: true },
  });

  for (const space of spaces) {
    const secret = decryptSecret(space.webhookSecret);
    if (secret && verifyTermiiSignature(rawBody, signature, secret)) {
      return { ok: true, spaceId: space.spaceId };
    }
  }

  const platformSecret = process.env.TERMII_WEBHOOK_SECRET?.trim();
  if (platformSecret && verifyTermiiSignature(rawBody, signature, platformSecret)) {
    return { ok: true, spaceId: null };
  }

  // Nothing to verify against at all is a configuration gap, not a forgery, and
  // the two want different status codes.
  if (spaces.length === 0 && !platformSecret) return { ok: false, reason: "unconfigured" };
  return { ok: false, reason: "invalid" };
}

/**
 * Termii's own status vocabulary, mapped onto NotificationLog's.
 *
 * "DND Active on Phone Number" is a failure and worth keeping distinct in the
 * error text: it means the sender ID is not DND-whitelisted, which is a
 * fixable configuration problem rather than a bad number.
 */
export function mapTermiiStatus(status: string | undefined): "delivered" | "failed" | null {
  switch (status?.trim().toUpperCase()) {
    case "DELIVERED":
      return "delivered";
    case "DND ACTIVE ON PHONE NUMBER":
    case "MESSAGE FAILED":
    case "REJECTED":
    case "EXPIRED":
      return "failed";
    // "Message Sent" is an intermediate acknowledgement, not an outcome.
    // Returning null leaves the row as `sent` rather than overwriting a later
    // `delivered` that arrived first.
    default:
      return null;
  }
}
