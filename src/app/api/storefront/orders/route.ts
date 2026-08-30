import { after, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { type ResolvedDelivery, resolveDeliverySelection } from "@/lib/delivery/resolve";
import { sendOrderEmails } from "@/lib/order-notifications";
import { getPaystackSecretKey, verifyTransaction } from "@/lib/paystack";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";
import { identifyStorefrontCaller, orderIdentityGate } from "@/lib/storefront-identity";
import { evaluateDiscountCode } from "@/lib/utils/discounts";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import {
  detectOversells,
  type StockConflictSource,
  type StockLine,
} from "@/lib/utils/inventory-conflicts";
import { earnLoyaltyForOrder } from "@/lib/utils/loyalty";
import { orderInstructions } from "@/lib/utils/order-notes";
import { computeOrderTotals, priceOrderLines } from "@/lib/utils/order-pricing";
import { serializeStorefrontOrder } from "@/lib/utils/storefront-order";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    if (!customerEmail) {
      return storefrontError("Customer email is required", 400, request);
    }

    const customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      return storefrontSuccess(
        { orders: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } },
        "No orders found",
        request
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { spaceId: ctx.spaceId, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: { select: { images: true } },
            },
          },
          customer: true,
        },
      }),
      prisma.order.count({
        where: { spaceId: ctx.spaceId, customerId: customer.id },
      }),
    ]);

    // This route used to hand-roll its own serialization, which is how it ended
    // up as the only one of the three that resolved item images correctly while
    // the shared serializer returned none. One shape, one place.
    const serializedOrders = orders.map((order) => ({
      ...serializeStorefrontOrder(order),
      paymentMethod: order.paymentMethod,
      // The shopper's own directions, never the metadata blob older orders
      // carry appended to this column. Stripped at the API boundary rather
      // than in the storefront: internal metadata has no business crossing
      // it, and doing it here fixes every consumer at once.
      notes: orderInstructions(order.notes),
    }));

    return storefrontSuccess(
      {
        orders: serializedOrders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Orders retrieved successfully",
      request
    );
  } catch (error) {
    console.error("Storefront orders GET error:", error);
    return storefrontError("Failed to fetch orders", 500, request);
  }
}

interface StorefrontOrderItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

interface StorefrontOrderPayload {
  items: StorefrontOrderItem[];
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    /**
     * The shopper's profile picture, forwarded by the storefront from their
     * Google/Supabase identity. A copy, not a link: DailyOS customers are
     * matched to auth users by email only.
     */
    avatarUrl?: string;
  };
  paymentMethod: string;
  paymentReference?: string;
  /**
   * The delivery option the shopper picked: a DeliveryZone row id, or a
   * `pickup:<state>` id minted by GET /api/storefront/delivery-zones. The fee
   * and any refundable hold are looked up server-side.
   */
  deliveryOptionId?: string;
  /** Accepted as an alias for deliveryOptionId so older clients keep working */
  deliveryZoneId?: string;
  /** The state this order is going to; required to price a delivery option */
  deliveryState?: string;
  /** Legacy/display only, never trusted for fee computation */
  shippingFee?: number;
  /** Re-validated server-side; a client-sent discount amount is never trusted */
  discountCode?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

async function generateStorefrontOrderNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const lastOrder = await tx.order.findFirst({
    where: {
      spaceId,
      orderNumber: { startsWith: `SF-${dateStr}` },
    },
    orderBy: { orderNumber: "desc" },
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `SF-${dateStr}-${sequence.toString().padStart(4, "0")}`;
}

/**
 * The contact fields a storefront order may write onto an EXISTING customer.
 *
 * Blanks only, and the reason is the threat model rather than tidiness. This
 * route's only credential is the space's storefront key, which every visitor to
 * the shop holds, and a bank-transfer order reaches the write with no payment
 * verification at all. Nothing proves the caller owns the email they typed, so
 * an unconditional update would let anyone who knows a customer's address
 * replace that customer's phone and address in the merchant's own records by
 * placing a throwaway order.
 *
 * Filling a null adds detail where the merchant had none; the worst a bad actor
 * achieves is populating an empty field. Correcting real details stays a
 * merchant action.
 */
export function fillableCustomerFields(
  existing: { phone: string | null; address: string | null; avatarUrl: string | null },
  incoming: { phone?: string; address?: string; avatarUrl?: string }
): { phone?: string; address?: string; avatarUrl?: string } {
  const fills: { phone?: string; address?: string; avatarUrl?: string } = {};
  if (!existing.phone && incoming.phone) fills.phone = incoming.phone;
  if (!existing.address && incoming.address) fills.address = incoming.address;
  if (!existing.avatarUrl && incoming.avatarUrl) fills.avatarUrl = incoming.avatarUrl;
  return fills;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit before any DB work (best-effort, per instance)
    const rate = checkRateLimit(`orders:${storefrontRateKey(request)}`, {
      capacity: 10,
      refillPerSec: 0.2,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const body: StorefrontOrderPayload = await request.json();

    if (!body.items || body.items.length === 0) {
      return storefrontError("Order must contain at least one item", 400, request);
    }

    if (!body.customer?.name) {
      return storefrontError("Customer name is required", 400, request);
    }

    /**
     * An order may not be attached to an account that has not proved its email.
     *
     * The backstop, not the gate. The storefront blocks this before the card is
     * charged, in its cart-validate step; by the time a request reaches here the
     * shopper has already paid, so a rejection means a debited card and no
     * order. It exists anyway because this is where the write happens and the
     * storefront is not the only thing that could ever call it, but it should
     * never fire in normal operation, and the storefront's own alerting treats a
     * non-recoverable 4xx here as something a human refunds.
     *
     * The three cases are deliberately distinct:
     *
     *   anonymous  - a guest checkout, which stays open to everyone. This is
     *                also why an unverified shopper can simply sign out and buy
     *                the same basket: the rule is about what an order is
     *                attached to, not about who may buy.
     *   invalid    - a token was offered and did not verify. Never silently
     *                downgraded to the guest path, or the check would be
     *                bypassable by mangling the header.
     *   identified - allowed only once Customer.emailVerifiedAt is set.
     *
     * The address is taken from the verified token, never from body.customer,
     * and a token whose address disagrees with the body is refused rather than
     * reconciled: it means the session and the form belong to different people.
     */
    const gate = orderIdentityGate(
      await identifyStorefrontCaller(request),
      body.customer.email ?? null
    );
    if (gate.kind === "reject") {
      return storefrontError(gate.message, gate.status, request);
    }

    /**
     * The proven address wins over the typed one.
     *
     * A signed-in shopper who leaves the email field blank still owns this
     * order. Deriving the customer from the body alone would attach it to a
     * fresh row with a null email instead of their account, so the order would
     * never appear in their history and loyalty and discount usage would land
     * on the wrong customer. The gate above has already refused the case where
     * the two disagree, so this is the same address or the only one there is.
     */
    const customerEmail =
      gate.kind === "identified" ? gate.email : body.customer.email?.trim().toLowerCase() || null;

    // Validate quantities before any DB work
    for (const item of body.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return storefrontError("Each item must have a positive integer quantity", 400, request);
      }
    }

    // Fetch all products in the order
    const uniqueProductIds = [...new Set(body.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        spaceId: ctx.spaceId,
        status: "active",
        isPublished: true,
      },
      include: { variants: true },
    });

    if (products.length !== uniqueProductIds.length) {
      return storefrontError("One or more products not found or unavailable", 400, request);
    }

    // Pricing is shared with POST /api/storefront/quote so a quote and the
    // order created from it cannot disagree, see @/lib/utils/order-pricing.
    const priced = priceOrderLines(products, body.items);
    if (!priced.ok) {
      return storefrontError(priced.error, 400, request);
    }
    const { lines: orderItems, subtotal, totalCost } = priced;

    // Server-authoritative totals: the client-sent shippingFee is never trusted.
    // The fee, any refundable hold, and whether the free shipping threshold may
    // touch this option all come from the merchant's own configuration, and the
    // option is checked against the state the parcel is going to.
    //
    // A rejection here is a hard 400 rather than the quote route's soft issue:
    // a shopper who had checkout open while an option was retired is asked to
    // pick again, never silently moved to a different option at a different
    // price.
    let shippingFee = 0;
    let deposit = 0;
    let shippingQualifiesForFreeShipping = true;
    let deliveryZoneId: string | null = null;
    let delivery: ResolvedDelivery | null = null;
    const deliveryOptionId = body.deliveryOptionId || body.deliveryZoneId;
    if (deliveryOptionId) {
      const resolved = await resolveDeliverySelection(prisma, {
        spaceId: ctx.spaceId,
        optionId: deliveryOptionId,
        state: body.deliveryState,
      });
      if (!resolved.ok) {
        return storefrontError(resolved.error, 400, request);
      }
      delivery = resolved.delivery;
      shippingFee = resolved.delivery.shippingFee;
      deposit = resolved.delivery.deposit;
      shippingQualifiesForFreeShipping = resolved.delivery.qualifiesForFreeShipping;
      deliveryZoneId = resolved.delivery.deliveryZoneId;
    }

    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId: ctx.spaceId },
      select: {
        taxRate: true,
        currency: true,
        taxOnDiscountedAmount: true,
        freeShippingThreshold: true,
      },
    });
    const taxRate = Number(settings?.taxRate ?? 0);

    // Discount is re-evaluated here, never taken from the client, and applied
    // BEFORE the Paystack amount check below, a discount applied after it
    // would reject every discounted payment the customer had already made.
    let appliedDiscount = 0;
    let appliedDiscountCode: string | null = null;
    if (body.discountCode?.trim()) {
      // Same address the order attaches to, so per-customer discount limits are
      // counted against the account rather than against a body field.
      const customerForDiscount = customerEmail
        ? await prisma.customer.findUnique({
            where: {
              spaceId_email: {
                spaceId: ctx.spaceId,
                email: customerEmail,
              },
            },
            select: { id: true },
          })
        : null;

      const evaluation = await evaluateDiscountCode(prisma, {
        spaceId: ctx.spaceId,
        code: body.discountCode,
        orderTotal: subtotal,
        customerId: customerForDiscount?.id,
        productIds: orderItems.map((i) => i.productId),
        currency: settings?.currency ?? "NGN",
      });

      // Reject rather than silently charging full price: the customer was
      // quoted a discounted total and is about to be charged that amount.
      if (!evaluation.ok) {
        return storefrontError(evaluation.error, 400, request);
      }
      appliedDiscount = evaluation.discount.discountAmount;
      appliedDiscountCode = evaluation.discount.code;
    }

    const totals = computeOrderTotals({
      subtotal,
      discount: appliedDiscount,
      taxRate,
      shippingFee,
      taxOnDiscountedAmount: settings?.taxOnDiscountedAmount ?? true,
      // Same threshold the quote used, so the order cannot disagree with the
      // amount the customer was shown and Paystack was charged.
      freeShippingThreshold: Number(settings?.freeShippingThreshold ?? 0),
      shippingQualifiesForFreeShipping,
      deposit,
    });
    const { discount, tax, total } = totals;

    const paymentReference = body.paymentReference?.trim() || null;

    // Idempotency: a replayed checkout with the same payment reference
    // returns the existing order instead of creating a duplicate
    if (paymentReference) {
      const existing = await prisma.order.findUnique({
        where: {
          spaceId_paymentReference: { spaceId: ctx.spaceId, paymentReference },
        },
        include: {
          items: { include: { product: { select: { images: true } } } },
          customer: true,
        },
      });
      if (existing) {
        return storefrontSuccess(
          serializeStorefrontOrder(existing),
          "Order already processed",
          request
        );
      }
    }

    // Verify card payments against Paystack BEFORE creating the order.
    // Transfer (manual bank transfer) orders are created as pending and
    // confirmed by the merchant.
    // Set by the card-verification branch below, so the write can record the id
    // Paystack itself reported rather than one the browser claimed.
    let verifiedTransactionId: string | null = null;
    const isCardPayment = body.paymentMethod === "card";
    if (isCardPayment) {
      if (!paymentReference) {
        return storefrontError("paymentReference is required for card payments", 400, request);
      }

      // Per-space merchant key (encrypted in CommerceSettings), env fallback
      const secretKey = await getPaystackSecretKey(ctx.spaceId);
      if (!secretKey) {
        console.error(
          `Card order rejected: no Paystack secret key configured for space ${ctx.spaceId}`
        );
        return storefrontError("Card payments are not configured for this store", 503, request);
      }

      const verification = await verifyTransaction(paymentReference, secretKey);
      verifiedTransactionId = verification?.transactionId ?? null;
      if (verification?.status !== "success") {
        return storefrontError("Payment verification failed", 400, request);
      }

      const expectedAmount = Math.round(total * 100); // Paystack amounts are in subunits (kobo)
      if (verification.amount !== expectedAmount) {
        console.error(
          `Paystack amount mismatch for ${paymentReference}: charged ${verification.amount}, expected ${expectedAmount}`
        );
        return storefrontError("Payment amount does not match order total", 400, request);
      }

      if (
        settings?.currency &&
        verification.currency &&
        verification.currency.toUpperCase() !== settings.currency.toUpperCase()
      ) {
        return storefrontError("Payment currency does not match store currency", 400, request);
      }
    }
    const orderStatus = isCardPayment ? "confirmed" : "pending";

    // `notes` is the shopper's delivery instructions and nothing else.
    //
    // It used to also carry `Metadata: ${JSON.stringify(body.metadata)}`, which
    // put a JSON blob in front of the merchant where the directions to the
    // house should be, and blew the receipt modal open sideways because the
    // blob is one long run with no spaces to wrap on. Every figure in it
    // (subtotal, tax, discount, shippingFee, total, paystackReference) was
    // already a column on this table. The one field that was not now has one.
    const deliveryInstructions = body.notes?.trim() || null;
    // Paystack's, not the client's.
    //
    // This started life as body.metadata.paystackTransaction, which is a number
    // the browser hands us. Storing that and then showing it to the merchant as
    // the transaction id defeats the only reason the column exists: you cannot
    // reconcile a payment against a figure supplied by whoever made the
    // payment. verifyTransaction already talks to Paystack on the card path, so
    // the authoritative id is right there.
    //
    // A transfer order has no verified transaction and gets null. That is
    // honest: there is nothing to reconcile against yet, and an unverifiable
    // number in the field would read as though there were.
    const paymentTransactionId = verifiedTransactionId;

    // Wrap everything in a transaction for atomicity.
    // Retry on unique constraint violation (P2002) for order number race conditions.
    const MAX_RETRIES = 3;
    let lastError: unknown;
    // biome-ignore lint/suspicious/noExplicitAny: reassigned across retry attempts before the Prisma payload type is known
    let order: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await prisma.$transaction(
          async (tx) => {
            const orderNumber = await generateStorefrontOrderNumber(tx, ctx.spaceId);

            // Check stock availability for all items BEFORE creating the order.
            //
            // Shares `detectOversells` with the POS path so there is one
            // definition of what an oversell is, but not the POS's answer to
            // one: the customer is on a website, not standing at the counter
            // holding the goods, so refusing is both possible and right. What
            // is adopted from the POS path is the case it used to drop,
            // an item with no inventory record sold, no movement written, and
            // nothing anywhere saying the stock ledger is now wrong.
            //
            // Grouping by inventory item also closes a real gap: the old
            // per-line check passed two lines of the same product that
            // oversold together.
            const inventoryItems = await tx.inventoryItem.findMany({
              where: {
                spaceId: ctx.spaceId,
                productId: { in: orderItems.map((item) => item.productId) },
              },
            });
            const inventoryItemCache = new Map(
              inventoryItems.map((inv) => [`${inv.productId}:${inv.variantId}`, inv])
            );

            const stockLines: StockLine[] = orderItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              inventoryItemId:
                inventoryItemCache.get(`${item.productId}:${item.variantId}`)?.id ?? null,
            }));

            const stockBefore = await getStockByInventoryItems(
              stockLines
                .map((line) => line.inventoryItemId)
                .filter((id): id is string => id !== null),
              tx
            );

            const stockConflicts = detectOversells(stockLines, stockBefore);

            const oversell = stockConflicts.find((c) => c.kind === "oversell");
            if (oversell) {
              const name =
                orderItems.find(
                  (item) =>
                    item.productId === oversell.productId && item.variantId === oversell.variantId
                )?.name ?? "this item";
              throw new Error(
                `Insufficient stock for ${name}: ${oversell.stockBefore} available, ${oversell.quantityOrdered} requested`
              );
            }

            // Find or create customer (emails stored lowercase)
            let customer = null;
            if (customerEmail) {
              customer = await tx.customer.findFirst({
                where: { spaceId: ctx.spaceId, email: customerEmail },
              });
            }
            if (customer) {
              // Blanks only, never an overwrite. See fillableCustomerFields.
              // The order's own shipping snapshot is what fulfilment reads, and
              // that is written per order regardless of this.
              const fills = fillableCustomerFields(customer, body.customer);
              if (Object.keys(fills).length > 0) {
                customer = await tx.customer.update({
                  where: { id: customer.id },
                  data: fills,
                });
              }
            } else {
              customer = await tx.customer.create({
                data: {
                  spaceId: ctx.spaceId,
                  name: body.customer.name,
                  email: customerEmail,
                  phone: body.customer.phone || null,
                  address: body.customer.address || null,
                  avatarUrl: body.customer.avatarUrl || null,
                },
              });
            }

            // Create order
            const newOrder = await tx.order.create({
              data: {
                spaceId: ctx.spaceId,
                orderNumber,
                customerId: customer.id,
                source: "storefront",
                paymentMethod: isCardPayment ? "card" : "transfer",
                status: orderStatus,
                subtotal,
                tax,
                discount,
                discountCode: appliedDiscountCode,
                shippingFee,
                deliveryZoneId,
                // The live FK above goes null when a zone is retired. These are
                // what the customer saw and agreed to, kept whatever happens to
                // the option afterwards.
                deliveryType: delivery?.deliveryType ?? null,
                deliveryState: delivery?.state ?? null,
                deliveryLabel: delivery?.label ?? null,
                deliveryNote: delivery?.note ?? null,
                deliveryPickupAddress: delivery?.pickupAddress ?? null,
                depositFee: deposit,
                depositStatus: deposit > 0 ? "held" : "none",
                paymentReference,
                paymentTransactionId,
                total,
                totalCost,
                notes: deliveryInstructions,
                // Where this parcel is going, frozen now. Customer.address is
                // overwritten by the next order to a different address.
                shippingName: body.customer.name,
                shippingAddress: body.customer.address || null,
                shippingPhone: body.customer.phone || null,
                items: { create: orderItems },
                statusHistory: { create: { status: orderStatus } },
              },
              include: {
                items: { include: { product: { select: { images: true } } } },
                customer: true,
              },
            });

            // Award loyalty points atomically with the order
            const loyaltyPointsEarned = await earnLoyaltyForOrder(tx, {
              spaceId: ctx.spaceId,
              customerId: customer.id,
              orderId: newOrder.id,
              orderNumber,
              orderTotal: total,
              // The hold comes back on collection, so it must not earn points
              // that would outlive the refund.
              deposit,
            });
            if (loyaltyPointsEarned > 0) {
              await tx.order.update({
                where: { id: newOrder.id },
                data: { loyaltyPointsEarned },
              });
            }

            // Record discount usage inside the same transaction. This sits on the
            // create path only: a replayed paymentReference returns early above,
            // so a customer retrying a charge can't burn their coupon twice.
            if (appliedDiscountCode && appliedDiscount > 0) {
              const usedDiscount = await tx.discount.update({
                where: {
                  spaceId_code: { spaceId: ctx.spaceId, code: appliedDiscountCode },
                },
                data: { usageCount: { increment: 1 } },
                select: { id: true },
              });

              await tx.discountUsage.upsert({
                where: {
                  discountId_customerId: {
                    discountId: usedDiscount.id,
                    customerId: customer.id,
                  },
                },
                create: {
                  discountId: usedDiscount.id,
                  customerId: customer.id,
                  orderId: newOrder.id,
                  usageCount: 1,
                },
                update: { usageCount: { increment: 1 }, orderId: newOrder.id },
              });
            }

            // Deduct inventory using the lines resolved above (stock was already
            // validated). Indexed rather than matched back by product, so two
            // lines resolving to one inventory item each book their own cost.
            for (const [index, line] of stockLines.entries()) {
              if (!line.inventoryItemId) continue;
              await tx.inventoryMovement.create({
                data: {
                  inventoryItemId: line.inventoryItemId,
                  type: "sale",
                  quantity: -line.quantity,
                  reference: newOrder.id,
                  referenceType: "order",
                  notes: `Storefront order ${orderNumber}`,
                  costAtTime: orderItems[index].unitCost,
                },
              });
            }

            // Only `missing_inventory_item` reaches here, an oversell already
            // threw. The sale went through and no movement was written for this
            // line, so the ledger is now short by exactly this much and someone
            // has to be told.
            if (stockConflicts.length > 0) {
              await tx.stockConflict.createMany({
                data: stockConflicts.map((conflict) => ({
                  spaceId: ctx.spaceId,
                  orderId: newOrder.id,
                  productId: conflict.productId,
                  variantId: conflict.variantId,
                  inventoryItemId: conflict.inventoryItemId,
                  kind: conflict.kind,
                  quantityOrdered: conflict.quantityOrdered,
                  stockBefore: conflict.stockBefore,
                  stockAfter: conflict.stockAfter,
                  source: "storefront" satisfies StockConflictSource,
                })),
              });
            }

            return newOrder;
          },
          { timeout: 30000 }
        );
        break; // Success, exit retry loop
      } catch (err) {
        lastError = err;
        if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
          // paymentReference conflict: a concurrent request with the same
          // reference won the race, return its order (idempotent replay)
          const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
          if (target.includes("paymentReference") && paymentReference) {
            const existing = await prisma.order.findUnique({
              where: {
                spaceId_paymentReference: {
                  spaceId: ctx.spaceId,
                  paymentReference,
                },
              },
              include: {
                items: { include: { product: { select: { images: true } } } },
                customer: true,
              },
            });
            if (existing) {
              return storefrontSuccess(
                serializeStorefrontOrder(existing),
                "Order already processed",
                request
              );
            }
          }
          // Order number race, retry with a fresh number
          continue;
        }
        throw err; // Non-retryable error
      }
    }

    if (!order) {
      throw lastError ?? new Error("Failed to create order after retries");
    }

    // Not awaited into the response, but scheduled with `after` rather than
    // simply dropped: an unawaited promise can be killed when the serverless
    // instance freezes the moment the response is sent, which made these
    // emails fail intermittently for no visible reason. `after` keeps the
    // instance alive for the work.
    after(() =>
      sendOrderEmails({
        orderId: order.id,
        orderNumber: order.orderNumber,
        spaceId: ctx.spaceId,
        customerName: order.customer?.name || body.customer.name,
        customerEmail: order.customer?.email || body.customer.email,
        items: orderItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
        })),
        subtotal,
        shippingFee,
        total,
        source: "storefront",
      }).catch((err) => console.error("Order email error:", err))
    );

    return storefrontSuccess(
      serializeStorefrontOrder(order),
      "Order created successfully",
      request
    );
  } catch (error) {
    console.error("Storefront order error:", error);
    if (error instanceof Error && error.message.startsWith("Insufficient stock")) {
      return storefrontError(error.message, 400, request);
    }
    return storefrontError("Failed to create order", 500, request);
  }
}
