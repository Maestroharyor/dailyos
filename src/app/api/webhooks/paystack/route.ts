import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveWebhookSigner } from "@/lib/paystack";
import { sendEmail } from "@/lib/email";
import { config } from "@/lib/config";

interface PaystackWebhookEvent {
  event: string;
  data?: {
    reference?: string;
    amount?: number;
    status?: string;
    currency?: string;
    paid_at?: string | null;
    customer?: {
      email?: string;
    };
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Grace period before an order-less charge is treated as genuinely orphaned. */
const ORPHAN_GRACE_MS = 10 * 60 * 1000;

/**
 * True when the charge is recent enough that the storefront's own order call
 * may still be in flight. Unparseable or missing paid_at counts as stale so a
 * malformed payload alerts rather than being deferred forever.
 */
function isRecentCharge(paidAt: string | null | undefined): boolean {
  if (!paidAt) return false;
  const ms = Date.parse(paidAt);
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < ORPHAN_GRACE_MS;
}

/**
 * A customer was charged but no order exists for the reference. The storefront
 * never reached POST /api/storefront/orders (browser closed mid-checkout, or it
 * died before its own alert could fire), so this webhook is the only signal
 * anyone gets. Email the merchant with everything needed to create the order by
 * hand or refund.
 */
async function alertOrphanedCharge(
  spaceId: string | null,
  data: NonNullable<PaystackWebhookEvent["data"]>,
): Promise<void> {
  const [settings, space] = await Promise.all([
    spaceId
      ? prisma.commerceSettings.findUnique({
          where: { spaceId },
          select: { storeName: true, storeEmail: true },
        })
      : null,
    spaceId
      ? prisma.space.findUnique({
          where: { id: spaceId },
          select: { name: true, owner: { select: { email: true } } },
        })
      : null,
  ]);

  const to = settings?.storeEmail || space?.owner?.email;
  if (!to) {
    console.error(`Orphaned charge ${data.reference} but no merchant email is configured`);
    return;
  }

  const storeName = settings?.storeName || space?.name || "your store";
  const reference = data.reference ?? "unknown";
  const currency = data.currency || "NGN";
  // Paystack reports subunits (kobo for NGN)
  const amount = typeof data.amount === "number" ? data.amount / 100 : null;

  const html = `
    <h2>Payment received with no matching order</h2>
    <p>
      A customer was charged on ${escapeHtml(storeName)}, but no order was
      created. They most likely closed the browser before checkout finished.
      <strong>Create the order manually or refund the customer.</strong>
    </p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Reference</strong></td><td>${escapeHtml(reference)}</td></tr>
      <tr><td><strong>Amount</strong></td><td>${
        amount === null ? "unknown" : `${escapeHtml(currency)} ${amount.toFixed(2)}`
      }</td></tr>
      <tr><td><strong>Customer</strong></td><td>${escapeHtml(
        data.customer?.email || "unknown",
      )}</td></tr>
      <tr><td><strong>Paid at</strong></td><td>${escapeHtml(data.paid_at || "unknown")}</td></tr>
    </table>
    <p>
      <a href="https://dashboard.paystack.com/#/transactions">Open the Paystack dashboard</a>
      &middot;
      <a href="${config.appUrl}/commerce/orders">Open orders in ${escapeHtml(config.appName)}</a>
    </p>
  `;

  await sendEmail({
    to,
    subject: `Action needed: payment ${reference} has no order`,
    html,
  });
}

/**
 * POST /api/webhooks/paystack
 *
 * Reconciliation path for storefront card payments, covering two cases where
 * the checkout call to /api/storefront/orders didn't finish the job:
 *
 *   1. A pending order exists for the reference → flip it to confirmed.
 *   2. No order exists at all (browser closed after the charge) → email the
 *      merchant so they can create it by hand or refund.
 *
 * Authenticated by the x-paystack-signature HMAC, not a storefront key.
 * Answers 200 for handled and ignored events so Paystack doesn't retry-storm.
 * The exceptions: signature/parse failures, unconfigured keys, and a still-fresh
 * order-less charge, which returns 503 on purpose so Paystack's retry backoff
 * acts as a grace period for the in-flight checkout call.
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  // The webhook isn't space-scoped and Paystack sends no space identifier, so
  // the signature is what identifies the sender: resolveWebhookSigner tries
  // each storefront-enabled space's key until one verifies. This must not go
  // back to picking a single space — a test space alongside the live one would
  // then break signature verification for real orders.
  const signature = request.headers.get("x-paystack-signature");
  const resolved = await resolveWebhookSigner(rawBody, signature);
  if (!resolved.ok) {
    // 503 on a missing key so Paystack retries once it's configured; 401 on a
    // bad signature, which retrying can never fix.
    const status = resolved.reason === "unconfigured" ? 503 : 401;
    return NextResponse.json({ received: false }, { status });
  }
  const signer = resolved.signer;

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    if (event.event === "charge.success" && event.data?.reference) {
      const order = await prisma.order.findFirst({
        where: { paymentReference: event.data.reference },
      });

      // No order at all: the customer was charged and nothing was recorded.
      // Order creation stays with the checkout call (it verifies the reference
      // itself), so rather than becoming a second creation path this alerts the
      // merchant to reconcile by hand.
      if (!order) {
        // The webhook routinely beats the storefront's own order call, which
        // retries for a few seconds. Answering 5xx while the charge is still
        // fresh borrows Paystack's retry backoff as a grace period, so we only
        // alert once it's clear no order is coming.
        if (isRecentCharge(event.data.paid_at)) {
          return NextResponse.json({ received: false }, { status: 503 });
        }
        await alertOrphanedCharge(signer.spaceId, event.data);
      } else if (order.status === "pending") {
        const expectedAmount = Math.round(Number(order.total) * 100);
        if (event.data.amount === expectedAmount) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "confirmed" },
          });
        } else {
          console.error(
            `Paystack webhook amount mismatch for ${event.data.reference}: charged ${event.data.amount}, expected ${expectedAmount}`,
          );
        }
      }
      // Already confirmed (normal case) → idempotent no-op
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    // 500 so Paystack retries transient failures
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
