// Server-only module: handles Paystack secrets, never import from client code.
import crypto from "crypto";

import { prisma } from "./db";
import { decryptSecret } from "./crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export interface PaystackVerification {
  /** Transaction status as reported by Paystack, e.g. "success", "failed", "abandoned" */
  status: string;
  /** Amount in the currency's subunit (kobo for NGN) */
  amount: number;
  currency: string;
  reference: string;
  paidAt: string | null;
  channel: string | null;
}

/**
 * Resolves the Paystack secret key for a space: the merchant-configured key
 * from CommerceSettings (stored encrypted) wins; the deployment-level
 * PAYSTACK_SECRET_KEY env var is the fallback. Returns null when neither is
 * configured — callers must treat that as "verification unavailable", never
 * as "skip verification".
 */
export async function getPaystackSecretKey(spaceId: string): Promise<string | null> {
  const settings = await prisma.commerceSettings.findUnique({
    where: { spaceId },
    select: { paystackSecretKey: true },
  });

  if (settings?.paystackSecretKey) {
    const decrypted = decryptSecret(settings.paystackSecretKey);
    if (decrypted) return decrypted;
    console.error(
      `Failed to decrypt Paystack secret key for space ${spaceId}; falling back to env`,
    );
  }

  return process.env.PAYSTACK_SECRET_KEY || null;
}

/**
 * Verifies a transaction against the Paystack API using the given secret key.
 * Returns the verification data, or null if Paystack does not know the
 * reference (404) or the request fails. Callers must treat null as
 * "payment not verified".
 */
export async function verifyTransaction(
  reference: string,
  secretKey: string,
): Promise<PaystackVerification | null> {
  const res = await fetch(
    `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    return null;
  }

  const body = (await res.json()) as {
    status: boolean;
    data?: {
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at: string | null;
      channel: string | null;
    };
  };

  if (!body.status || !body.data) {
    return null;
  }

  return {
    status: body.data.status,
    amount: body.data.amount,
    currency: body.data.currency,
    reference: body.data.reference,
    paidAt: body.data.paid_at,
    channel: body.data.channel,
  };
}

/**
 * Validates Paystack's webhook signature (HMAC-SHA512 of the raw request
 * body with the secret key, sent as the x-paystack-signature header).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string,
): boolean {
  if (!signature) return false;

  const expected = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface WebhookSigner {
  /** Space whose key verified the payload, or null when only the env key matched an ambiguous set. */
  spaceId: string | null;
  secretKey: string;
}

export type WebhookSignerResult =
  | { ok: true; signer: WebhookSigner }
  /** No signing key is configured anywhere — a config problem, so callers should 5xx and let Paystack retry. */
  | { ok: false; reason: "unconfigured" }
  /** Keys exist but none produced this signature — reject, do not retry. */
  | { ok: false; reason: "invalid" };

/**
 * Works out which storefront space signed a webhook payload.
 *
 * Paystack sends no space identifier, so the signature itself is the
 * discriminator: try each storefront-enabled space's key until one verifies.
 * Picking a space with findFirst() was only correct while exactly one space had
 * a storefront — the moment a second one exists (a test space alongside the
 * live one) it selects arbitrarily and every signature check fails, including
 * for real orders.
 *
 * Distinguishes "no key is configured" (a deployment problem worth retrying)
 * from "the signature matched nothing" (reject outright). Never treat either as
 * "trust it anyway".
 */
export async function resolveWebhookSigner(
  rawBody: string,
  signature: string | null,
): Promise<WebhookSignerResult> {
  if (!signature) return { ok: false, reason: "invalid" };

  const spaces = await prisma.space.findMany({
    where: { storefrontEnabled: true },
    select: {
      id: true,
      commerceSettings: { select: { paystackSecretKey: true } },
    },
  });

  let configuredKeys = 0;

  // Merchant-configured keys first — those unambiguously identify a space.
  for (const space of spaces) {
    const stored = space.commerceSettings?.paystackSecretKey;
    if (!stored) continue;

    const secretKey = decryptSecret(stored);
    if (!secretKey) {
      console.error(`Failed to decrypt Paystack secret key for space ${space.id}`);
      continue;
    }

    configuredKeys += 1;
    if (verifyWebhookSignature(rawBody, signature, secretKey)) {
      return { ok: true, signer: { spaceId: space.id, secretKey } };
    }
  }

  // Deployment-level fallback, used by any space without its own key. It only
  // identifies a space when exactly one space relies on it; otherwise the
  // payload is authentic but unattributable, and spaceId stays null.
  const envKey = process.env.PAYSTACK_SECRET_KEY;
  if (envKey) {
    configuredKeys += 1;
    if (verifyWebhookSignature(rawBody, signature, envKey)) {
      const envSpaces = spaces.filter((s) => !s.commerceSettings?.paystackSecretKey);
      return {
        ok: true,
        signer: {
          spaceId: envSpaces.length === 1 ? envSpaces[0].id : null,
          secretKey: envKey,
        },
      };
    }
  }

  if (configuredKeys === 0) {
    console.error("Paystack webhook received but no secret key is configured");
    return { ok: false, reason: "unconfigured" };
  }

  return { ok: false, reason: "invalid" };
}
