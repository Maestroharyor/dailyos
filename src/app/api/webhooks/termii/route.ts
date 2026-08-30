import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mapTermiiStatus, resolveTermiiSigner } from "@/lib/termii-webhook";

/**
 * Termii delivery receipts.
 *
 * Follows the Paystack route's discipline: raw body read before anything
 * parses it, signature resolved across every configured space, and a status
 * code chosen by whether retrying could possibly help. 200 for handled and for
 * ignored events alike, so a receipt for something we do not track does not
 * become a retry storm.
 */
interface TermiiDeliveryEvent {
  type?: string;
  id?: string;
  message_id?: string;
  receiver?: string;
  sender?: string;
  status?: string;
  cost?: number | string;
  channel?: string;
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const signature = request.headers.get("x-termii-signature");
  const resolved = await resolveTermiiSigner(rawBody, signature);
  if (!resolved.ok) {
    // 503 when there is nothing to verify against, so Termii retries once a
    // secret is configured. 401 on a bad signature, which retrying cannot fix.
    const status = resolved.reason === "unconfigured" ? 503 : 401;
    return NextResponse.json({ received: false }, { status });
  }

  let event: TermiiDeliveryEvent;
  try {
    event = JSON.parse(rawBody) as TermiiDeliveryEvent;
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const messageId = event.message_id;
  if (!messageId) return NextResponse.json({ received: true });

  const status = mapTermiiStatus(event.status);
  if (!status) return NextResponse.json({ received: true });

  try {
    // Matched by provider message id, which is the only handle a receipt
    // carries. updateMany rather than update: a receipt for a message we did
    // not send, or one already cleaned up, is not an error.
    const cost = typeof event.cost === "string" ? Number(event.cost) : event.cost;
    await prisma.notificationLog.updateMany({
      where: { providerMessageId: messageId },
      data: {
        status,
        // The cost only arrives here. It is what the monthly cap sums, so a
        // receipt that omits it leaves the row uncosted rather than zeroed.
        ...(typeof cost === "number" && Number.isFinite(cost) ? { cost } : {}),
        ...(status === "failed" ? { error: event.status?.slice(0, 500) ?? "Delivery failed" } : {}),
      },
    });
  } catch (error) {
    // 500 so Termii retries: a database blip should not lose a receipt.
    console.error("[sms] could not record delivery receipt:", error);
    return NextResponse.json({ received: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
