import { render } from "@react-email/components";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { config } from "./config";
import { OrderConfirmationEmail } from "./emails/order-confirmation";
import { NewOrderNotificationEmail } from "./emails/new-order-notification";

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
