import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature, getPaystackSecretKey } from "@/lib/paystack";

interface PaystackWebhookEvent {
  event: string;
  data?: {
    reference?: string;
    amount?: number;
    status?: string;
  };
}

/**
 * POST /api/webhooks/paystack
 *
 * Reconciliation path for storefront card payments: if the checkout call to
 * /api/storefront/orders never completed (network drop after a successful
 * charge), Paystack's charge.success webhook flips the matching pending
 * order to confirmed. Authenticated by the x-paystack-signature HMAC, not a
 * storefront key. Always answers 200 for handled/ignored events so Paystack
 * doesn't retry-storm; only signature failures get a non-2xx.
 */
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  // The webhook isn't space-scoped, but only one space can have the
  // storefront enabled (single-space binding), so its merchant key (or the
  // env fallback) is the signing key.
  const storefrontSpace = await prisma.space.findFirst({
    where: { storefrontEnabled: true },
    select: { id: true },
  });
  const secretKey = storefrontSpace
    ? await getPaystackSecretKey(storefrontSpace.id)
    : process.env.PAYSTACK_SECRET_KEY || null;
  if (!secretKey) {
    console.error("Paystack webhook received but no secret key is configured");
    return NextResponse.json({ received: false }, { status: 503 });
  }

  const signature = request.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(rawBody, signature, secretKey)) {
    return NextResponse.json({ received: false }, { status: 401 });
  }

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

      // No order yet: the checkout call owns order creation (it verifies the
      // reference itself), so this webhook is a no-op rather than a second
      // creation path.
      if (order && order.status === "pending") {
        const expectedAmount = Math.round(Number(order.total) * 100);
        if (event.data.amount === expectedAmount) {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "confirmed" },
          });
        } else {
          console.error(
            `Paystack webhook amount mismatch for ${event.data.reference}: charged ${event.data.amount}, expected ${expectedAmount}`
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
