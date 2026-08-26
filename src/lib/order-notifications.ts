import { render } from "@react-email/components";
import { config } from "./config";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { NewOrderNotificationEmail } from "./emails/new-order-notification";
import { OrderConfirmationEmail } from "./emails/order-confirmation";
import { OrderStatusUpdateEmail } from "./emails/order-status-update";

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
        select: { storeName: true, storeEmail: true, currency: true },
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
          currency,
          appName: config.appName,
        })
      );

      emails.push({
        to: data.customerEmail,
        subject: `Order ${data.orderNumber} confirmed — ${storeName}`,
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
        })
      );

      emails.push({
        to: ownerEmail,
        subject: `New order ${data.orderNumber} — ${data.customerName}`,
        html,
      });
    }

    if (emails.length === 0) return;

    await Promise.all(emails.map((e) => sendEmail(e)));
  } catch (error) {
    // Fire-and-forget: log but never throw
    console.error("Failed to send order emails:", error);
  }
}

/**
 * Statuses worth emailing a customer about.
 *
 * `pending` and `confirmed` are deliberately absent: a storefront card order is
 * created already confirmed and the confirmation email covers it, so including
 * them would double-mail on every purchase.
 */
const NOTIFIABLE_STATUSES = new Set(["processing", "completed", "cancelled", "refunded"]);

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
    if (!data.customerEmail) return;

    const [settings, space] = await Promise.all([
      prisma.commerceSettings.findUnique({
        where: { spaceId: data.spaceId },
        select: { storeName: true, storeEmail: true, currency: true },
      }),
      prisma.space.findUnique({
        where: { id: data.spaceId },
        select: { name: true },
      }),
    ]);

    const storeName = settings?.storeName || space?.name || "Store";

    const html = await render(
      OrderStatusUpdateEmail({
        customerName: data.customerName,
        orderNumber: data.orderNumber,
        status: data.status,
        total: data.total,
        storeName,
        currency: settings?.currency || "USD",
        appName: config.appName,
        supportEmail: settings?.storeEmail || null,
      })
    );

    await sendEmail({
      to: data.customerEmail,
      subject: `Order ${data.orderNumber} — ${data.status}`,
      html,
    });
  } catch (error) {
    console.error("Failed to send order status email:", error);
  }
}
