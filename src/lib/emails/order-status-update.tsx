import { Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "./components/EmailLayout";

interface OrderStatusUpdateEmailProps {
  customerName: string;
  orderNumber: string;
  status: string;
  total: number;
  storeName?: string;
  currency?: string;
  appName?: string;
  supportEmail?: string | null;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Plain-language copy per status. Customers don't know what "processing" means
 * in a commerce schema, so each one says what actually happened and what, if
 * anything, they need to do.
 */
const STATUS_COPY: Record<string, { heading: string; body: string }> = {
  processing: {
    heading: "Your order is being prepared",
    body: "We're packing your items now. You'll hear from us again as soon as they're on the way.",
  },
  completed: {
    heading: "Your order has been delivered",
    body: "Your order is complete. We hope you love it — if anything isn't right, just reply to this email.",
  },
  cancelled: {
    heading: "Your order has been cancelled",
    body: "This order has been cancelled and won't be delivered. If you were charged, your refund is on its way.",
  },
  refunded: {
    heading: "Your order has been refunded",
    body: "We've refunded this order. Refunds usually reach your account within a few business days, depending on your bank.",
  },
};

export const OrderStatusUpdateEmail = ({
  customerName = "there",
  orderNumber,
  status,
  total,
  storeName = "Store",
  currency = "USD",
  appName = "DailyOS",
  supportEmail = null,
}: OrderStatusUpdateEmailProps) => {
  const copy = STATUS_COPY[status] ?? {
    heading: "There's an update on your order",
    body: `Your order is now marked as ${status}.`,
  };

  return (
    <EmailLayout
      preview={`Order ${orderNumber} — ${copy.heading}`}
      brandName={storeName}
      heading={copy.heading}
      footerNote={`© ${new Date().getFullYear()} ${storeName}. Powered by ${appName}.`}
    >
      <Text>Hi {customerName},</Text>
      <Text>{copy.body}</Text>

      <Hr />

      <Section>
        <Text>
          <strong>Order</strong> {orderNumber}
        </Text>
        <Text>
          <strong>Total</strong> {formatAmount(total, currency)}
        </Text>
      </Section>

      {supportEmail ? (
        <Text>Questions about this order? Get in touch at {supportEmail}.</Text>
      ) : null}
    </EmailLayout>
  );
};

export default OrderStatusUpdateEmail;
