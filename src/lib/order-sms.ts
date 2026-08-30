import { Prisma } from "@prisma/client";
import { DEFAULT_PHONE_REGION, normalizePhone } from "./commerce/phone";
import { prisma } from "./db";
import { sendSmsForSpace, smsKillSwitchEngaged } from "./sms-transport";

// The decision layer between order-notifications.ts and the Termii transport.
//
// Everything that makes an SMS different from an email lives here: consent,
// idempotency, and the two spend guards. The transport knows how to send; this
// knows whether we should.
//
// The contract, matching the email path: nothing here throws into the order
// path. A notification that fails is a notification that failed, never an order
// that failed.

export type NotificationAudience = "customer" | "merchant";

/**
 * Ceiling on messages per order, across every event and audience.
 *
 * A real order tops out around nine: two on placement, one per notifiable
 * status, one for pickup. Ten is not a budget, it is the guard against a loop
 * that discovers itself at three in the morning. Hitting it means something is
 * wrong, so it is logged as a skip rather than silently absorbed.
 */
const MAX_SMS_PER_ORDER = 10;

export interface OrderSmsDispatch {
  spaceId: string;
  orderId: string;
  /** Stable per (order, audience): "order_placed", "status_changed:shipped", "pickup_ready". */
  event: string;
  audience: NotificationAudience;
  /** Raw, as stored. Normalized here; the columns are not clean. */
  phone: string | null | undefined;
  body: string;
}

interface SpaceSmsContext {
  notifyCustomer: boolean;
  notifyMerchant: boolean;
  merchantPhone: string;
  merchantSmsSources: string[];
  monthlyCapAmount: Prisma.Decimal;
  region: string;
}

/** Null when the space has no SMS settings at all, which is the common case. */
export async function loadOrderSmsContext(spaceId: string): Promise<SpaceSmsContext | null> {
  const [settings, commerce] = await Promise.all([
    prisma.spaceSmsSettings.findUnique({ where: { spaceId } }),
    prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { defaultPhoneRegion: true },
    }),
  ]);

  if (!settings) return null;

  return {
    notifyCustomer: settings.notifyCustomer,
    notifyMerchant: settings.notifyMerchant,
    merchantPhone: settings.merchantPhone,
    merchantSmsSources: settings.merchantSmsSources,
    monthlyCapAmount: settings.monthlyCapAmount,
    region: commerce?.defaultPhoneRegion || DEFAULT_PHONE_REGION,
  };
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Whether this space has spent past its monthly cap.
 *
 * Sums the cost that delivery receipts actually reported. Termii does not price
 * a message in the send response, so a message with no receipt yet counts as
 * zero: this cap trails reality rather than predicting it, and it cannot be
 * made exact without a published rate card. MAX_SMS_PER_ORDER is the guard that
 * actually stops a runaway; this one stops a slow overspend.
 */
async function capReached(spaceId: string, cap: Prisma.Decimal): Promise<boolean> {
  if (cap.lessThanOrEqualTo(0)) return false;

  const spent = await prisma.notificationLog.aggregate({
    where: {
      spaceId,
      channel: "sms",
      status: { in: ["sent", "delivered"] },
      createdAt: { gte: startOfMonth() },
    },
    _sum: { cost: true },
  });

  return (spent._sum.cost ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(cap);
}

/**
 * Records a decision not to send.
 *
 * Written to the log rather than dropped, because a skip and a send that never
 * ran look identical afterwards otherwise, and the next attempt would send. The
 * row also claims the idempotency key, so an opted-out customer does not get
 * reconsidered on every retry.
 */
async function recordSkip(dispatch: OrderSmsDispatch, recipient: string, reason: string) {
  try {
    await prisma.notificationLog.create({
      data: {
        spaceId: dispatch.spaceId,
        orderId: dispatch.orderId,
        event: dispatch.event,
        channel: "sms",
        audience: dispatch.audience,
        recipient,
        status: "skipped",
        error: reason.slice(0, 500),
      },
    });
  } catch {
    // A unique violation means something already decided about this
    // notification, which is the outcome we wanted anyway.
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Sends one order SMS, at most once, if everything says it should go.
 *
 * The order of the guards is deliberate. The kill switch comes first and
 * deliberately writes nothing: it is an operational stop, not a decision about
 * this message, and a skipped row would permanently consume the idempotency key
 * so the message could never be sent after the switch came back on.
 *
 * The claim is written before the send rather than after. A read-then-send
 * check races a concurrent duplicate through the gap between the two, and on a
 * paid channel that gap is the whole bug. Here the unique key is the lock.
 */
export async function sendOrderSms(dispatch: OrderSmsDispatch): Promise<void> {
  try {
    if (smsKillSwitchEngaged()) return;

    const context = await loadOrderSmsContext(dispatch.spaceId);
    if (!context) return;

    if (dispatch.audience === "customer" && !context.notifyCustomer) return;
    if (dispatch.audience === "merchant" && !context.notifyMerchant) return;

    const recipient = normalizePhone(dispatch.phone, context.region);
    if (!recipient) {
      // Logged rather than silent: a shop where most numbers are unparseable
      // has a checkout problem, and the log is where that becomes visible.
      await recordSkip(dispatch, dispatch.phone?.slice(0, 40) ?? "", "Phone number is unparseable");
      return;
    }

    const sentForOrder = await prisma.notificationLog.count({
      where: { orderId: dispatch.orderId, channel: "sms" },
    });
    if (sentForOrder >= MAX_SMS_PER_ORDER) {
      await recordSkip(dispatch, recipient, "Per-order message ceiling reached");
      return;
    }

    if (await capReached(dispatch.spaceId, context.monthlyCapAmount)) {
      await recordSkip(dispatch, recipient, "Monthly spend cap reached");
      return;
    }

    let claim: { id: string };
    try {
      claim = await prisma.notificationLog.create({
        data: {
          spaceId: dispatch.spaceId,
          orderId: dispatch.orderId,
          event: dispatch.event,
          channel: "sms",
          audience: dispatch.audience,
          recipient,
          status: "queued",
        },
        select: { id: true },
      });
    } catch (error) {
      // Already claimed. This is the duplicate-suppression path and the
      // expected outcome of a status change that fires twice.
      if (isUniqueViolation(error)) return;
      throw error;
    }

    const result = await sendSmsForSpace(dispatch.spaceId, {
      to: recipient,
      body: dispatch.body,
    });

    await prisma.notificationLog.update({
      where: { id: claim.id },
      data: {
        status: result.success ? "sent" : "failed",
        provider: result.provider,
        providerMessageId: result.messageId ?? null,
        error: result.error?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    // Fire-and-forget, exactly as the email path is. A notification must never
    // fail an order.
    console.error("[sms] order notification failed:", error);
  }
}

/** Whether a merchant alert is wanted for an order from this source. */
export function merchantWantsSms(context: { merchantSmsSources: string[] }, source: string) {
  return context.merchantSmsSources.includes(source);
}
