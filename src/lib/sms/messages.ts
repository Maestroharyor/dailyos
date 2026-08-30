/**
 * Plain-text SMS bodies for the three order notifications.
 *
 * Email goes through render() on react-email components; SMS cannot, so these
 * are built here as strings. Every one of them must come back as a single
 * GSM-7 page, and that is enforced by construction rather than by care: the
 * store name is squeezed until the message fits, because it is the one field a
 * merchant can make arbitrarily long and the one whose loss costs the least.
 *
 * Tone follows STATUS_COPY in src/lib/emails/order-status-update.tsx, shortened.
 * The email version can afford a sentence of reassurance; 160 septets cannot.
 */
import { orderStatusLabel } from "@/lib/commerce/order-status";
import { gsm7Length, MAX_GSM7_SEPTETS, toGsm7 } from "./gsm7";

/** What a status change says, in the space a text message has. */
const STATUS_SMS_COPY: Record<string, string> = {
  processing: "is being prepared",
  out_for_delivery: "is out for delivery today, please keep your phone nearby",
  delivered: "has been delivered",
  completed: "is complete",
  cancelled: "has been cancelled, any charge will be refunded",
  refunded: "has been refunded, allow a few days for your bank",
};

/**
 * Money as a text message can carry it: "NGN 45,200".
 *
 * The currency code rather than its symbol, always. Intl would happily return
 * "₦45,200.00", and that one character drops the whole message from 160
 * characters to 70 and doubles what it costs to send.
 *
 * Minor units only when they are not zero. Most Nigerian order totals are whole
 * naira and ".00" is four septets of nothing.
 */
export function formatSmsAmount(amount: number, currency: string): string {
  const code = toGsm7(currency).toUpperCase() || "NGN";
  const hasMinorUnits = Math.abs(amount % 1) > 0.0001;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: hasMinorUnits ? 2 : 0,
    maximumFractionDigits: hasMinorUnits ? 2 : 0,
  }).format(amount);
  return `${code} ${formatted}`;
}

/**
 * Builds a message and guarantees it is one GSM-7 page.
 *
 * `build` receives a progressively shorter store name. Shrinking that rather
 * than truncating the finished string is what keeps the order number and the
 * amount intact — those are the parts a customer needs, and a message ending
 * "order ORD-001" is worse than one from a shop whose name lost its suffix.
 *
 * The final hard truncation is a backstop for input that cannot fit even with
 * no store name at all, which takes an absurd order number. It cuts rather than
 * throws: failing to send an order confirmation is worse than sending a clipped
 * one.
 */
function fitToPage(build: (storeName: string) => string, storeName: string): string {
  let name = toGsm7(storeName);
  let message = build(name);

  while (name.length > 0) {
    const length = gsm7Length(message);
    if (length !== null && length <= MAX_GSM7_SEPTETS) return message;
    name = name.slice(0, -1).trimEnd();
    message = build(name);
  }

  const length = gsm7Length(message);
  if (length !== null && length <= MAX_GSM7_SEPTETS) return message;
  return hardTruncate(message);
}

/** Cuts to 160 septets, counting extension characters as the two they cost. */
function hardTruncate(message: string): string {
  let out = "";
  let septets = 0;
  for (const char of message) {
    const cost = gsm7Length(char) ?? 0;
    if (septets + cost > MAX_GSM7_SEPTETS) break;
    out += char;
    septets += cost;
  }
  return out.trimEnd();
}

/** A store name is optional in the wire sense; the message still has to read. */
function prefix(storeName: string): string {
  return storeName ? `${storeName}: ` : "";
}

export interface OrderPlacedSms {
  storeName: string;
  orderNumber: string;
  total: number;
  currency: string;
}

/** Sent to the customer when the order is created. */
export function orderPlacedCustomerSms(data: OrderPlacedSms): string {
  const orderNumber = toGsm7(data.orderNumber);
  const amount = formatSmsAmount(data.total, data.currency);
  return fitToPage(
    (store) =>
      `${prefix(store)}order ${orderNumber} confirmed, ${amount}. We will text you when there is an update.`,
    data.storeName
  );
}

export interface OrderPlacedMerchantSms extends OrderPlacedSms {
  customerName: string;
}

/** Sent to the merchant when an order arrives while nobody is watching. */
export function orderPlacedMerchantSms(data: OrderPlacedMerchantSms): string {
  const orderNumber = toGsm7(data.orderNumber);
  const amount = formatSmsAmount(data.total, data.currency);
  // The customer name is squeezed alongside the store name here, because on a
  // merchant alert the name is the least load-bearing part: the order number
  // is what they act on.
  const customer = toGsm7(data.customerName);
  return fitToPage(
    (store) =>
      `${prefix(store)}new order ${orderNumber} from ${customer || "a customer"}, ${amount}.`,
    data.storeName
  );
}

export interface OrderStatusSms {
  storeName: string;
  orderNumber: string;
  status: string;
}

/** Sent to the customer when the order reaches a notifiable status. */
export function orderStatusCustomerSms(data: OrderStatusSms): string {
  const orderNumber = toGsm7(data.orderNumber);
  const copy =
    STATUS_SMS_COPY[data.status] ?? `is now ${toGsm7(orderStatusLabel(data.status)).toLowerCase()}`;
  return fitToPage((store) => `${prefix(store)}order ${orderNumber} ${copy}.`, data.storeName);
}

export interface PickupReadySms {
  storeName: string;
  orderNumber: string;
  deadlineLabel: string;
}

/**
 * Sent to the customer when an order is ready to collect.
 *
 * The deadline is the load-bearing part, not the address: the address is on the
 * order and in the email, and a text message that tries to carry both loses the
 * date. Deliberately no address here.
 */
export function pickupReadyCustomerSms(data: PickupReadySms): string {
  const orderNumber = toGsm7(data.orderNumber);
  const deadline = toGsm7(data.deadlineLabel);
  return fitToPage(
    (store) =>
      `${prefix(store)}order ${orderNumber} is ready to collect. Please pick it up by ${deadline}.`,
    data.storeName
  );
}
