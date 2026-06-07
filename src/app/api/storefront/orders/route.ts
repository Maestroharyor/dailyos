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
import {
  checkRateLimit,
  storefrontRateKey,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { earnLoyaltyForOrder } from "@/lib/utils/loyalty";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail =
      request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
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
          (img: { isPrimary: boolean }) => img.isPrimary
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
  };
  paymentMethod: string;
  paymentReference?: string;
  /** Merchant-configured delivery zone; the fee is looked up server-side */
  deliveryZoneId?: string;
  /** Legacy/display only — never trusted for fee computation */
  shippingFee?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// Storefront-safe order serialization: no unitCost/totalCost (internal
// accounting data must not leak to the public API)
function serializeStorefrontOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: unknown;
  tax: unknown;
  shippingFee: unknown;
  total: unknown;
  createdAt: Date;
  items: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: unknown;
    total: unknown;
  }>;
  customer: { id: string; name: string; email: string | null } | null;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    shippingFee: Number(order.shippingFee),
    total: Number(order.total),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      total: Number(i.total),
    })),
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          email: order.customer.email,
        }
      : null,
    createdAt: order.createdAt,
  };
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
        return storefrontError(
          "Each item must have a positive integer quantity",
          400,
          request
        );
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
      return storefrontError(
        "One or more products not found or unavailable",
        400,
        request
      );
    }

    // Build order items and calculate totals
    let subtotal = 0;
    let totalCost = 0;
    const orderItems: {
      productId: string;
      variantId: string | null;
      name: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      total: number;
    }[] = [];

    for (const item of body.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) continue;

      let unitPrice: number;
      let unitCost: number;
      let name: string;
      let sku: string;
      let variantId: string | null = null;

      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) {
          return storefrontError(
            `Variant ${item.variantId} not found for product ${product.name}`,
            400,
            request
          );
        }
        unitPrice = Number(variant.price);
        unitCost = Number(variant.costPrice);
        name = `${product.name} - ${variant.name}`;
        sku = variant.sku;
        variantId = variant.id;
      } else {
        unitPrice =
          product.onSale && product.salePrice
            ? Number(product.salePrice)
            : Number(product.price);
        unitCost = Number(product.costPrice);
        name = product.name;
        sku = product.sku;
      }

      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      totalCost += unitCost * item.quantity;

      orderItems.push({
        productId: product.id,
        variantId,
        name,
        sku,
        quantity: item.quantity,
        unitPrice,
        unitCost,
        total: lineTotal,
      });
    }

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
      select: { taxRate: true, currency: true },
    });
    const taxRate = Number(settings?.taxRate ?? 0);
    const tax = round2(subtotal * (taxRate / 100));
    const total = round2(subtotal + tax + shippingFee);

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
          request
        );
      }
    }

    // Verify card payments against Paystack BEFORE creating the order.
    // Transfer (manual bank transfer) orders are created as pending and
    // confirmed by the merchant.
    const isCardPayment = body.paymentMethod === "card";
    if (isCardPayment) {
      if (!paymentReference) {
        return storefrontError(
          "paymentReference is required for card payments",
          400,
          request
        );
      }

      // Per-space merchant key (encrypted in CommerceSettings), env fallback
      const secretKey = await getPaystackSecretKey(ctx.spaceId);
      if (!secretKey) {
        console.error(
          `Card order rejected: no Paystack secret key configured for space ${ctx.spaceId}`
        );
        return storefrontError(
          "Card payments are not configured for this store",
          503,
          request
        );
      }

      const verification = await verifyTransaction(paymentReference, secretKey);
      if (!verification || verification.status !== "success") {
        return storefrontError("Payment verification failed", 400, request);
      }

      const expectedAmount = Math.round(total * 100); // Paystack amounts are in subunits (kobo)
      if (verification.amount !== expectedAmount) {
        console.error(
          `Paystack amount mismatch for ${paymentReference}: charged ${verification.amount}, expected ${expectedAmount}`
        );
        return storefrontError(
          "Payment amount does not match order total",
          400,
          request
        );
      }

      if (
        settings?.currency &&
        verification.currency &&
        verification.currency.toUpperCase() !== settings.currency.toUpperCase()
      ) {
        return storefrontError(
          "Payment currency does not match store currency",
          400,
          request
        );
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let order: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await prisma.$transaction(async (tx) => {
          const orderNumber = await generateStorefrontOrderNumber(tx, ctx.spaceId);

          // Check stock availability for all items BEFORE creating the order
          const inventoryItemCache = new Map<string, { id: string }>();
          for (const item of orderItems) {
            const inventoryItem = await tx.inventoryItem.findFirst({
              where: {
                spaceId: ctx.spaceId,
                productId: item.productId,
                variantId: item.variantId,
              },
            });

            if (inventoryItem) {
              inventoryItemCache.set(`${item.productId}:${item.variantId}`, inventoryItem);
              const stockAgg = await tx.inventoryMovement.aggregate({
                where: { inventoryItemId: inventoryItem.id },
                _sum: { quantity: true },
              });
              const currentStock = stockAgg._sum.quantity || 0;
              if (currentStock < item.quantity) {
                throw new Error(
                  `Insufficient stock for ${item.name}: ${currentStock} available, ${item.quantity} requested`
                );
              }
            }
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
              discount: 0,
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

          // Deduct inventory using cached items (stock was already validated above)
          for (const item of orderItems) {
            const inventoryItem = inventoryItemCache.get(`${item.productId}:${item.variantId}`);
            if (inventoryItem) {
              await tx.inventoryMovement.create({
                data: {
                  inventoryItemId: inventoryItem.id,
                  type: "sale",
                  quantity: -item.quantity,
                  reference: newOrder.id,
                  referenceType: "order",
                  notes: `Storefront order ${orderNumber}`,
                  costAtTime: item.unitCost,
                },
              });
            }
          }

          return newOrder;
        }, { timeout: 30000 });
        break; // Success — exit retry loop
      } catch (err) {
        lastError = err;
        if (
          err instanceof Error &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          // paymentReference conflict: a concurrent request with the same
          // reference won the race — return its order (idempotent replay)
          const target = String(
            (err as { meta?: { target?: unknown } }).meta?.target ?? ""
          );
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
                request
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
      request
    );
  } catch (error) {
    console.error("Storefront order error:", error);
    if (
      error instanceof Error &&
      error.message.startsWith("Insufficient stock")
    ) {
      return storefrontError(error.message, 400, request);
    }
    return storefrontError("Failed to create order", 500, request);
  }
}
