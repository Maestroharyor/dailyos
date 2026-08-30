import { render } from "@react-email/components";
import { NOTIFIABLE_ORDER_STATUSES, orderStatusLabel } from "./commerce/order-status";
import { config } from "./config";
import { prisma } from "./db";
import { sendForSpace } from "./email-transport";
import { NewOrderNotificationEmail } from "./emails/new-order-notification";
import { OrderConfirmationEmail } from "./emails/order-confirmation";
import { OrderStatusUpdateEmail } from "./emails/order-status-update";
import { PickupReadyEmail } from "./emails/pickup-ready";
import { loadOrderSmsContext, merchantWantsSms, sendOrderSms } from "./order-sms";
import {
  orderPlacedCustomerSms,
  orderPlacedMerchantSms,
  orderStatusCustomerSms,
  pickupReadyCustomerSms,
} from "./sms/messages";

export interface OrderEmailData {
  orderId: string;
  orderNumber: string;
  spaceId: string;
  customerName: string;
  customerEmail?: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  subtotal: number;
  shippingFee: number;
  total: number;
  source: string;
}

export async function sendOrderEmails(data: OrderEmailData): Promise<void> {
  try {
    // Fetch store settings and owner info
    const [settings, space] = await Promise.all([
      prisma.commerceSettings.findUnique({
        where: { spaceId: data.spaceId },
        select: {
          storeName: true,
          storeEmail: true,
          storeLogo: true,
          currency: true,
          themePrimary: true,
        },
      }),
      prisma.space.findUnique({
        where: { id: data.spaceId },
        select: {
          name: true,
          owner: { select: { name: true, email: true } },
        },
      }),
    ]);

    const storeName = settings?.storeName || space?.name || "Store";
    // Empty rather than absent is the common case today, nothing writes
    // themePrimary yet, and an empty string would paint the wordmark
    // transparent, so it has to collapse to undefined for the layout default.
    const brandColor = settings?.themePrimary || undefined;
    // Empty string is the column default, and an empty src renders a broken
    // image icon in most mail clients, so it has to collapse to undefined for
    // the layout's text-wordmark fallback to kick in.
    const logoUrl = settings?.storeLogo || undefined;
    const currency = settings?.currency || "USD";
    const ownerEmail = settings?.storeEmail || space?.owner?.email;
    const ownerName = space?.owner?.name || "Store Owner";
    const orderUrl = `${config.appUrl}/commerce/orders/${data.orderId}`;

    const emails: { to: string; subject: string; html: string }[] = [];

    // 1. Customer confirmation email
    if (data.customerEmail) {
      const html = await render(
        OrderConfirmationEmail({
          customerName: data.customerName,
          orderNumber: data.orderNumber,
          items: data.items,
          subtotal: data.subtotal,
          shippingFee: data.shippingFee,
          total: data.total,
          storeName,
          brandColor,
          currency,
          appName: config.appName,
          appUrl: config.marketingUrl,
          logoUrl,
        })
      );

      emails.push({
        to: data.customerEmail,
        subject: `Order ${data.orderNumber} confirmed - ${storeName}`,
        html,
      });
    }

    // 2. Store owner notification email
    if (ownerEmail) {
      const html = await render(
        NewOrderNotificationEmail({
          ownerName,
          orderNumber: data.orderNumber,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          itemCount: data.items.reduce((sum, i) => sum + i.quantity, 0),
          total: data.total,
          source: data.source,
          storeName,
          orderUrl,
          currency,
          appName: config.appName,
          appUrl: config.marketingUrl,
          logoUrl,
        })
      );

      emails.push({
        to: ownerEmail,
        subject: `New order ${data.orderNumber} - ${data.customerName}`,
        html,
      });
    }

    if (emails.length > 0) {
      await Promise.all(emails.map((e) => sendForSpace(data.spaceId, e)));
    }

    await sendOrderPlacedSms(data, storeName, currency);
  } catch (error) {
    // Fire-and-forget: log but never throw
    console.error("Failed to send order emails:", error);
  }
}

/**
 * The SMS half of order placement.
 *
 * Reads Order.shippingPhone rather than Customer.phone. The customer row's
 * phone is fillable from the request body on a route whose only credential is
 * the storefront key every shop visitor holds; the order's is the snapshot
 * taken when this order was placed. For a message that costs money and lands on
 * somebody's handset, the snapshot is the one to trust.
 */
async function sendOrderPlacedSms(
  data: OrderEmailData,
  storeName: string,
  currency: string
): Promise<void> {
  const context = await loadOrderSmsContext(data.spaceId);
  if (!context) return;

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: { shippingPhone: true },
  });

  await sendOrderSms({
    spaceId: data.spaceId,
    orderId: data.orderId,
    event: "order_placed",
    audience: "customer",
    phone: order?.shippingPhone,
    body: orderPlacedCustomerSms({
      storeName,
      orderNumber: data.orderNumber,
      total: data.total,
      currency,
    }),
  });

  // The merchant alert is gated on where the order came from. A POS sale
  // happens with the merchant at the counter, so texting them about it is a
  // paid message describing what they just did.
  if (!merchantWantsSms(context, data.source)) return;

  await sendOrderSms({
    spaceId: data.spaceId,
    orderId: data.orderId,
    event: "order_placed",
    audience: "merchant",
    phone: context.merchantPhone,
    body: orderPlacedMerchantSms({
      storeName,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      total: data.total,
      currency,
    }),
  });
}

/**
 * Statuses worth emailing a customer about.
 *
 * `pending` and `confirmed` are deliberately absent: a storefront card order is
 * created already confirmed and the confirmation email covers it, so including
 * them would double-mail on every purchase.
 */
const NOTIFIABLE_STATUSES = new Set<string>(NOTIFIABLE_ORDER_STATUSES);

export interface OrderStatusEmailData {
  orderId: string;
  orderNumber: string;
  spaceId: string;
  status: string;
  customerName: string;
  customerEmail?: string | null;
  total: number;
}

/**
 * Tells the customer their order moved. Silent for statuses they don't care
 * about, and for orders with no email on file (walk-in and POS sales).
 *
 * Fire-and-forget like sendOrderEmails: a mail failure must never roll back or
 * fail the status change that already happened.
 */
export async function sendOrderStatusEmail(data: OrderStatusEmailData): Promise<void> {
  try {
    if (!NOTIFIABLE_STATUSES.has(data.status)) return;

    const [settings, space] = await Promise.all([
      prisma.commerceSettings.findUnique({
        where: { spaceId: data.spaceId },
        select: {
          storeName: true,
          storeEmail: true,
          storeLogo: true,
          currency: true,
          themePrimary: true,
        },
      }),
      prisma.space.findUnique({
        where: { id: data.spaceId },
        select: { name: true },
      }),
    ]);

    const storeName = settings?.storeName || space?.name || "Store";

    // The email is skipped for an order with no address, but the SMS below is
    // not. Gating both on the email address is what would silently exclude
    // walk-in and POS orders, which are exactly the population a phone number
    // exists to reach.
    if (data.customerEmail) {
      const html = await render(
        OrderStatusUpdateEmail({
          customerName: data.customerName,
          orderNumber: data.orderNumber,
          status: data.status,
          total: data.total,
          storeName,
          brandColor: settings?.themePrimary || undefined,
          currency: settings?.currency || "USD",
          appName: config.appName,
          appUrl: config.marketingUrl,
          logoUrl: settings?.storeLogo || undefined,
          supportEmail: settings?.storeEmail || null,
        })
      );

      await sendForSpace(data.spaceId, {
        to: data.customerEmail,
        subject: `Order ${data.orderNumber} - ${orderStatusLabel(data.status)}`,
        html,
      });
    }

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: { shippingPhone: true },
    });

    // Keyed on the status, not just the order: each status is its own
    // notification and each gets its own idempotency row.
    await sendOrderSms({
      spaceId: data.spaceId,
      orderId: data.orderId,
      event: `status_changed:${data.status}`,
      audience: "customer",
      phone: order?.shippingPhone,
      body: orderStatusCustomerSms({
        storeName,
        orderNumber: data.orderNumber,
        status: data.status,
      }),
    });
  } catch (error) {
    console.error("Failed to send order status email:", error);
  }
}

export interface PickupReadyEmailData {
  /** Needed for the SMS idempotency key; the email path only ever used the number. */
  orderId: string;
  orderNumber: string;
  spaceId: string;
  customerName: string;
  customerEmail?: string | null;
  pickupAddress: string;
  windowLabel: string;
  deadline: Date;
  depositAmount: number;
}

/**
 * Tells the customer their order is ready to collect, and returns whether it
 * actually went.
 *
 * The one email in this file that is not fire-and-forget. Everything else here
 * reports something that already happened, so a mail failure is a missed
 * notification and nothing more. This one *starts* the collection deadline, and
 * the deadline is the basis for eventually releasing somebody's paid-for goods.
 * If the send fails and the notification timestamp is stamped anyway, a clock
 * runs against a customer who was never told, so the caller needs to know.
 */
export async function sendPickupReadyEmail(data: PickupReadyEmailData): Promise<boolean> {
  if (!data.customerEmail) return false;

  try {
    const [settings, space] = await Promise.all([
      prisma.commerceSettings.findUnique({
        where: { spaceId: data.spaceId },
        select: {
          storeName: true,
          storeEmail: true,
          storeLogo: true,
          currency: true,
          themePrimary: true,
        },
      }),
      prisma.space.findUnique({ where: { id: data.spaceId }, select: { name: true } }),
    ]);

    const storeName = settings?.storeName || space?.name || "Store";
    const deadlineLabel = data.deadline.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const html = await render(
      PickupReadyEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        pickupAddress: data.pickupAddress,
        windowLabel: data.windowLabel,
        deadlineLabel,
        depositAmount: data.depositAmount,
        storeName,
        brandColor: settings?.themePrimary || undefined,
        currency: settings?.currency || "NGN",
        appName: config.appName,
        appUrl: config.marketingUrl,
        logoUrl: settings?.storeLogo || undefined,
        supportEmail: settings?.storeEmail || null,
      })
    );

    await sendForSpace(data.spaceId, {
      to: data.customerEmail,
      subject: `Order ${data.orderNumber} is ready to collect`,
      html,
    });

    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      select: { shippingPhone: true },
    });

    await sendOrderSms({
      spaceId: data.spaceId,
      orderId: data.orderId,
      event: "pickup_ready",
      audience: "customer",
      phone: order?.shippingPhone,
      body: pickupReadyCustomerSms({
        storeName,
        orderNumber: data.orderNumber,
        deadlineLabel,
      }),
    });

    // Still keyed on the email. It is what starts the collection deadline, and
    // an SMS that failed must not stop a deadline the customer was emailed
    // about.
    return true;
  } catch (error) {
    console.error("Failed to send pickup ready email:", error);
    return false;
  }
}
