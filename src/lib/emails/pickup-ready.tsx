import { Hr, Section, Text } from "@react-email/components";
import { config } from "@/lib/config";
import { EmailLayout, PoweredByFooter } from "./components/EmailLayout";

interface PickupReadyEmailProps {
  customerName: string;
  orderNumber: string;
  /** Where to collect. The store address, or a per-space override. */
  pickupAddress: string;
  /** Display copy for the window, e.g. "14 - 16 working days". */
  windowLabel: string;
  /** The computed last day to collect, already formatted for display. */
  deadlineLabel: string;
  /** The refundable hold, if one was taken. Zero renders nothing. */
  depositAmount: number;
  storeName?: string;
  brandColor?: string;
  currency?: string;
  appName?: string;
  appUrl?: string;
  logoUrl?: string;
  supportEmail?: string | null;
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

/**
 * The notification that starts the collection clock.
 *
 * This email is the whole basis for a merchant later releasing somebody's
 * paid-for item, so it states the deadline as a date rather than only as a
 * window, and says plainly what happens to the deposit either way. A customer
 * cannot be held to a term they were never shown.
 */
export const PickupReadyEmail = ({
  customerName = "there",
  orderNumber,
  pickupAddress,
  windowLabel,
  deadlineLabel,
  depositAmount = 0,
  storeName = "Store",
  brandColor,
  currency = "NGN",
  appName = "DailyOS",
  appUrl = config.marketingUrl,
  logoUrl,
  supportEmail = null,
}: PickupReadyEmailProps) => (
  <EmailLayout
    preview={`Order ${orderNumber} is ready to collect`}
    brandName={storeName}
    logoUrl={logoUrl}
    brandColor={brandColor}
    heading="Your order is ready to collect"
    footerNote={
      <PoweredByFooter
        storeName={storeName}
        appName={appName}
        appUrl={appUrl}
      />
    }
  >
    <Text>Hi {customerName},</Text>
    <Text>
      Order {orderNumber} is packed and waiting for you. Please collect it within {windowLabel}.
    </Text>

    <Hr />

    <Section>
      <Text>
        <strong>Collect from</strong>
        <br />
        {pickupAddress}
      </Text>
      <Text>
        <strong>Please collect by</strong> {deadlineLabel}
      </Text>
      {depositAmount > 0 ? (
        <Text>
          <strong>Your {formatAmount(depositAmount, currency)} deposit</strong> is refunded when you
          collect.
        </Text>
      ) : null}
    </Section>

    <Hr />

    <Text>
      If your order is not collected by {deadlineLabel}, we reserve the right to release the item(s)
      for sale to another customer. You would be refunded for the order
      {depositAmount > 0 ? ", though the deposit is retained" : ""}.
    </Text>

    {supportEmail ? (
      <Text>
        Need longer, or can't make it? Reply to this email or get in touch at {supportEmail}.
      </Text>
    ) : null}
  </EmailLayout>
);

export default PickupReadyEmail;
