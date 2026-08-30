import { describe, expect, it } from "vitest";
import { NOTIFIABLE_ORDER_STATUSES } from "@/lib/commerce/order-status";
import { gsm7Length, isGsm7, isSingleGsm7Page, MAX_GSM7_SEPTETS } from "./gsm7";
import {
  formatSmsAmount,
  orderPlacedCustomerSms,
  orderPlacedMerchantSms,
  orderStatusCustomerSms,
  pickupReadyCustomerSms,
} from "./messages";

// Inputs chosen to break things, not to look nice. A merchant will eventually
// have all of these at once.
const LONG_STORE =
  "Vickytee’s Glamour & Bougie Luxury Accessories Emporium International Limited 🛍️";
const LONG_ORDER = "ORD-2026-08-30-000012345";
const LONG_CUSTOMER = "Oluwatobiloba Adebayo-Fatunde Oluwaseunfunmi";
const BIG_TOTAL = 98765.43;

/** The two rules the brief set, asserted together everywhere. */
function expectSendable(message: string) {
  expect(isGsm7(message)).toBe(true);
  expect(isSingleGsm7Page(message)).toBe(true);
  expect(message).not.toContain("₦");
  // No character outside the GSM-7 alphabet, which covers every emoji.
  expect(gsm7Length(message)).not.toBeNull();
}

describe("formatSmsAmount", () => {
  it("writes the currency code, never the symbol", () => {
    expect(formatSmsAmount(45200, "NGN")).toBe("NGN 45,200");
    expect(formatSmsAmount(45200, "NGN")).not.toContain("₦");
  });

  it("drops zero minor units, which are four septets of nothing", () => {
    expect(formatSmsAmount(12500, "NGN")).toBe("NGN 12,500");
    expect(formatSmsAmount(12500.0, "NGN")).toBe("NGN 12,500");
  });

  it("keeps minor units when they are not zero", () => {
    expect(formatSmsAmount(12500.5, "NGN")).toBe("NGN 12,500.50");
  });

  it("handles zero and small amounts", () => {
    expect(formatSmsAmount(0, "NGN")).toBe("NGN 0");
    expect(formatSmsAmount(50, "USD")).toBe("USD 50");
  });

  it("falls back rather than emitting a non-GSM-7 currency", () => {
    expect(isGsm7(formatSmsAmount(100, "₦"))).toBe(true);
  });

  it("is GSM-7 for every currency code we might see", () => {
    for (const currency of ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"]) {
      expect(isGsm7(formatSmsAmount(1234567.89, currency))).toBe(true);
    }
  });
});

describe("orderPlacedCustomerSms", () => {
  it("reads correctly with ordinary input", () => {
    const message = orderPlacedCustomerSms({
      storeName: "VKT Bougie",
      orderNumber: "ORD-00123",
      total: 45200,
      currency: "NGN",
    });
    expect(message).toBe(
      "VKT Bougie: order ORD-00123 confirmed, NGN 45,200. We will text you when there is an update."
    );
    expectSendable(message);
  });

  it("survives a long store name, a long order number and a five-digit amount", () => {
    const message = orderPlacedCustomerSms({
      storeName: LONG_STORE,
      orderNumber: LONG_ORDER,
      total: BIG_TOTAL,
      currency: "NGN",
    });
    expectSendable(message);
    // The parts the customer needs survive; the store name is what gets cut.
    expect(message).toContain(LONG_ORDER);
    expect(message).toContain("NGN 98,765.43");
  });

  it("squeezes the store name only as far as it has to, keeping the rest whole", () => {
    const message = orderPlacedCustomerSms({
      storeName: "x".repeat(400),
      orderNumber: "ORD-00123",
      total: 45200,
      currency: "NGN",
    });
    expectSendable(message);
    // Everything after the store name survives intact, and the name keeps
    // whatever room is left rather than being dropped wholesale.
    expect(message).toContain(
      "order ORD-00123 confirmed, NGN 45,200. We will text you when there is an update."
    );
    expect(message.startsWith("x")).toBe(true);
    expect(gsm7Length(message)).toBe(MAX_GSM7_SEPTETS);
  });

  it("drops the store name entirely when nothing else will fit", () => {
    const message = orderPlacedCustomerSms({
      storeName: "x".repeat(400),
      orderNumber: "ORD-".concat("9".repeat(100)),
      total: 45200,
      currency: "NGN",
    });
    expectSendable(message);
    expect(message.startsWith("order ORD-9")).toBe(true);
  });

  it("handles an empty store name without a stray colon", () => {
    const message = orderPlacedCustomerSms({
      storeName: "",
      orderNumber: "ORD-00123",
      total: 45200,
      currency: "NGN",
    });
    expect(message.startsWith("order ")).toBe(true);
    expectSendable(message);
  });
});

describe("orderPlacedMerchantSms", () => {
  it("leads with the order number, which is what the merchant acts on", () => {
    const message = orderPlacedMerchantSms({
      storeName: "VKT Bougie",
      orderNumber: "ORD-00123",
      customerName: "Ada Obi",
      total: 45200,
      currency: "NGN",
    });
    expect(message).toBe("VKT Bougie: new order ORD-00123 from Ada Obi, NGN 45,200.");
    expectSendable(message);
  });

  it("survives every long input at once", () => {
    const message = orderPlacedMerchantSms({
      storeName: LONG_STORE,
      orderNumber: LONG_ORDER,
      customerName: LONG_CUSTOMER,
      total: BIG_TOTAL,
      currency: "NGN",
    });
    expectSendable(message);
    expect(message).toContain(LONG_ORDER);
  });

  it("drops the from clause for a guest checkout rather than trailing off", () => {
    const message = orderPlacedMerchantSms({
      storeName: "VKT",
      orderNumber: "ORD-1",
      customerName: "",
      total: 100,
      currency: "NGN",
    });
    expect(message).toBe("VKT: new order ORD-1, NGN 100.");
    expectSendable(message);
  });

  it("sacrifices the customer name too, keeping the amount", () => {
    // The store name alone is not always enough to claw back. Before the
    // customer name was made sacrificial, a long enough one pushed the message
    // past the budget and the hard truncation cut the tail, which is where the
    // amount sits: the merchant alert silently lost the number it exists to
    // report.
    const message = orderPlacedMerchantSms({
      storeName: LONG_STORE,
      orderNumber: LONG_ORDER,
      customerName: "Oluwatobiloba ".repeat(12),
      total: BIG_TOTAL,
      currency: "NGN",
    });
    expectSendable(message);
    expect(message).toContain(LONG_ORDER);
    expect(message).toContain("NGN 98,765.43");
    expect(message.endsWith(".")).toBe(true);
  });
});

describe("orderStatusCustomerSms", () => {
  it("has copy for every status that is actually notifiable", () => {
    // If a status joins NOTIFIABLE_ORDER_STATUSES without copy here, this fails
    // rather than quietly sending the generic fallback.
    for (const status of NOTIFIABLE_ORDER_STATUSES) {
      const message = orderStatusCustomerSms({
        storeName: "VKT Bougie",
        orderNumber: "ORD-00123",
        status,
      });
      expect(message).not.toContain("is now");
      expectSendable(message);
    }
  });

  it("falls back readably for an unknown status", () => {
    const message = orderStatusCustomerSms({
      storeName: "VKT Bougie",
      orderNumber: "ORD-00123",
      status: "shipped",
    });
    expect(message).toContain("ORD-00123");
    expectSendable(message);
  });

  it("survives long inputs on the longest status copy", () => {
    const message = orderStatusCustomerSms({
      storeName: LONG_STORE,
      orderNumber: LONG_ORDER,
      status: "out_for_delivery",
    });
    expectSendable(message);
    expect(message).toContain(LONG_ORDER);
  });
});

describe("pickupReadyCustomerSms", () => {
  it("carries the deadline, which is the load-bearing part", () => {
    const message = pickupReadyCustomerSms({
      storeName: "VKT Bougie",
      orderNumber: "ORD-00123",
      deadlineLabel: "Friday 5 September 2026",
    });
    expect(message).toBe(
      "VKT Bougie: order ORD-00123 is ready to collect. Please pick it up by Friday 5 September 2026."
    );
    expectSendable(message);
  });

  it("survives long inputs", () => {
    const message = pickupReadyCustomerSms({
      storeName: LONG_STORE,
      orderNumber: LONG_ORDER,
      deadlineLabel: "Wednesday 30 September 2026",
    });
    expectSendable(message);
    expect(message).toContain("30 September 2026");
  });
});

describe("every template, under every combination of hostile input", () => {
  const stores = ["", "VKT", LONG_STORE, "x".repeat(400), "Café ’Ō’ 🎀"];
  const customers = ["", "Ada", LONG_CUSTOMER, "y".repeat(300), "Ọlá’ 🎀"];
  const orders = ["ORD-1", "ORD-00123", LONG_ORDER];
  const totals = [0, 50, 45200, BIG_TOTAL, 9999999.99];
  const currencies = ["NGN", "USD", "GHS"];

  it("never exceeds one GSM-7 page and never emits a non-GSM-7 character", () => {
    for (const storeName of stores) {
      for (const orderNumber of orders) {
        for (const total of totals) {
          for (const currency of currencies) {
            expectSendable(orderPlacedCustomerSms({ storeName, orderNumber, total, currency }));
            for (const customerName of customers) {
              const merchant = orderPlacedMerchantSms({
                storeName,
                orderNumber,
                total,
                currency,
                customerName,
              });
              expectSendable(merchant);
              // The amount is the last thing in the template, so a message that
              // still ends in a full stop is one nothing was cut off.
              expect(merchant.endsWith(".")).toBe(true);
            }
            expectSendable(
              pickupReadyCustomerSms({
                storeName,
                orderNumber,
                deadlineLabel: "Wednesday 30 September 2026",
              })
            );
            for (const status of NOTIFIABLE_ORDER_STATUSES) {
              expectSendable(orderStatusCustomerSms({ storeName, orderNumber, status }));
            }
          }
        }
      }
    }
  });

  it("keeps the order number in every message, since that is what is acted on", () => {
    for (const storeName of stores) {
      const message = orderPlacedCustomerSms({
        storeName,
        orderNumber: LONG_ORDER,
        total: BIG_TOTAL,
        currency: "NGN",
      });
      expect(message).toContain(LONG_ORDER);
      expect(gsm7Length(message)).toBeLessThanOrEqual(MAX_GSM7_SEPTETS);
    }
  });
});
