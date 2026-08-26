import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";
import { sendOrderEmails } from "@/lib/order-notifications";
import { verifyTransaction, getPaystackSecretKey } from "@/lib/paystack";
import { checkRateLimit, storefrontRateKey, rateLimitedResponse } from "@/lib/rate-limit";
import { earnLoyaltyForOrder } from "@/lib/utils/loyalty";
import { evaluateDiscountCode } from "@/lib/utils/discounts";
import { computeOrderTotals, priceOrderLines } from "@/lib/utils/order-pricing";
import { serializeStorefrontOrder } from "@/lib/utils/storefront-order";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import {
  detectOversells,
  type StockConflictSource,
  type StockLine,
} from "@/lib/utils/inventory-conflicts";

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
        request,
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

    const serializedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      subtotal: Number(order.subtotal),
      tax: Number(order.tax),
      discount: Number(order.discount),
      shippingFee: Number(order.shippingFee),
      total: Number(order.total),
      notes: order.notes,
      createdAt: order.createdAt,
      items: order.items.map((item) => {
        const primaryImage = item.product?.images?.find(
          (img: { isPrimary: boolean }) => img.isPrimary,
        );
        const firstImage = item.product?.images?.[0];
        const image = primaryImage || firstImage;
        return {
          id: item.id,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
          image: image ? (image as { url: string }).url : null,
        };
      }),
      customer: order.customer
        ? {
            name: order.customer.name,
            email: order.customer.email,
            phone: order.customer.phone,
            address: order.customer.address,
          }
        : null,
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
      request,
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
  };
  paymentMethod: string;
  paymentReference?: string;
  /** Merchant-configured delivery zone; the fee is looked up server-side */
  deliveryZoneId?: string;
  /** Legacy/display only — never trusted for fee computation */
  shippingFee?: number;
  /** Re-validated server-side; a client-sent discount amount is never trusted */
  discountCode?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

async function generateStorefrontOrderNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string,
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
    // order created from it cannot disagree — see @/lib/utils/order-pricing.
    const priced = priceOrderLines(products, body.items);
    if (!priced.ok) {
      return storefrontError(priced.error, 400, request);
    }
    const { lines: orderItems, subtotal, totalCost } = priced;

    // Server-authoritative totals: the client-sent shippingFee is never
    // trusted; the fee comes from the merchant-configured delivery zone
    let shippingFee = 0;
    let deliveryZoneId: string | null = null;
    if (body.deliveryZoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { id: body.deliveryZoneId, spaceId: ctx.spaceId, isActive: true },
      });
      if (!zone) {
        return storefrontError("Invalid or inactive delivery zone", 400, request);
      }
      shippingFee = Number(zone.fee);
      deliveryZoneId = zone.id;
    }

    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId: ctx.spaceId },
      select: { taxRate: true, currency: true, taxOnDiscountedAmount: true },
    });
    const taxRate = Number(settings?.taxRate ?? 0);

    // Discount is re-evaluated here, never taken from the client, and applied
    // BEFORE the Paystack amount check below — a discount applied after it
    // would reject every discounted payment the customer had already made.
    let appliedDiscount = 0;
    let appliedDiscountCode: string | null = null;
    if (body.discountCode?.trim()) {
      const customerForDiscount = body.customer.email?.trim().toLowerCase()
        ? await prisma.customer.findUnique({
            where: {
              spaceId_email: {
                spaceId: ctx.spaceId,
                email: body.customer.email.trim().toLowerCase(),
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
    });
    const { discount, tax, total } = totals;

    const paymentReference = body.paymentReference?.trim() || null;
    const customerEmail = body.customer.email?.trim().toLowerCase() || null;

    // Idempotency: a replayed checkout with the same payment reference
    // returns the existing order instead of creating a duplicate
    if (paymentReference) {
      const existing = await prisma.order.findUnique({
        where: {
          spaceId_paymentReference: { spaceId: ctx.spaceId, paymentReference },
        },
        include: { items: true, customer: true },
      });
      if (existing) {
        return storefrontSuccess(
          serializeStorefrontOrder(existing),
          "Order already processed",
          request,
        );
      }
    }

    // Verify card payments against Paystack BEFORE creating the order.
    // Transfer (manual bank transfer) orders are created as pending and
    // confirmed by the merchant.
    const isCardPayment = body.paymentMethod === "card";
    if (isCardPayment) {
      if (!paymentReference) {
        return storefrontError("paymentReference is required for card payments", 400, request);
      }

      // Per-space merchant key (encrypted in CommerceSettings), env fallback
      const secretKey = await getPaystackSecretKey(ctx.spaceId);
      if (!secretKey) {
        console.error(
          `Card order rejected: no Paystack secret key configured for space ${ctx.spaceId}`,
        );
        return storefrontError("Card payments are not configured for this store", 503, request);
      }

      const verification = await verifyTransaction(paymentReference, secretKey);
      if (!verification || verification.status !== "success") {
        return storefrontError("Payment verification failed", 400, request);
      }

      const expectedAmount = Math.round(total * 100); // Paystack amounts are in subunits (kobo)
      if (verification.amount !== expectedAmount) {
        console.error(
          `Paystack amount mismatch for ${paymentReference}: charged ${verification.amount}, expected ${expectedAmount}`,
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

    // Build notes with metadata
    const noteParts: string[] = [];
    if (body.notes) noteParts.push(body.notes);
    if (body.metadata) {
      noteParts.push(`Metadata: ${JSON.stringify(body.metadata)}`);
    }

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
            // is adopted from the POS path is the case it used to drop —
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
              inventoryItems.map((inv) => [`${inv.productId}:${inv.variantId}`, inv]),
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
              tx,
            );

            const stockConflicts = detectOversells(stockLines, stockBefore);

            const oversell = stockConflicts.find((c) => c.kind === "oversell");
            if (oversell) {
              const name =
                orderItems.find(
                  (item) =>
                    item.productId === oversell.productId && item.variantId === oversell.variantId,
                )?.name ?? "this item";
              throw new Error(
                `Insufficient stock for ${name}: ${oversell.stockBefore} available, ${oversell.quantityOrdered} requested`,
              );
            }

            // Find or create customer (emails stored lowercase)
            let customer = null;
            if (customerEmail) {
              customer = await tx.customer.findFirst({
                where: { spaceId: ctx.spaceId, email: customerEmail },
              });
            }
            if (!customer) {
              customer = await tx.customer.create({
                data: {
                  spaceId: ctx.spaceId,
                  name: body.customer.name,
                  email: customerEmail,
                  phone: body.customer.phone || null,
                  address: body.customer.address || null,
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
                paymentReference,
                total,
                totalCost,
                notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
                items: { create: orderItems },
              },
              include: { items: true, customer: true },
            });

            // Award loyalty points atomically with the order
            const loyaltyPointsEarned = await earnLoyaltyForOrder(tx, {
              spaceId: ctx.spaceId,
              customerId: customer.id,
              orderId: newOrder.id,
              orderNumber,
              orderTotal: total,
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

            // Only `missing_inventory_item` reaches here — an oversell already
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
          { timeout: 30000 },
        );
        break; // Success — exit retry loop
      } catch (err) {
        lastError = err;
        if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
          // paymentReference conflict: a concurrent request with the same
          // reference won the race — return its order (idempotent replay)
          const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? "");
          if (target.includes("paymentReference") && paymentReference) {
            const existing = await prisma.order.findUnique({
              where: {
                spaceId_paymentReference: {
                  spaceId: ctx.spaceId,
                  paymentReference,
                },
              },
              include: { items: true, customer: true },
            });
            if (existing) {
              return storefrontSuccess(
                serializeStorefrontOrder(existing),
                "Order already processed",
                request,
              );
            }
          }
          // Order number race — retry with a fresh number
          continue;
        }
        throw err; // Non-retryable error
      }
    }

    if (!order) {
      throw lastError ?? new Error("Failed to create order after retries");
    }

    // Fire-and-forget: send order emails without blocking the response
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
    }).catch((err) => console.error("Order email error:", err));

    return storefrontSuccess(
      serializeStorefrontOrder(order),
      "Order created successfully",
      request,
    );
  } catch (error) {
    console.error("Storefront order error:", error);
    if (error instanceof Error && error.message.startsWith("Insufficient stock")) {
      return storefrontError(error.message, 400, request);
    }
    return storefrontError("Failed to create order", 500, request);
  }
}
