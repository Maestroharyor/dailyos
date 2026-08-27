"use server";

import type {
  Customer as PCustomer,
  OrderItem as POItem,
  Order as POrder,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { isClientRequestIdConflict, isUniqueViolation } from "@/lib/offline/idempotency";
import { isProvisionalSuffix, provisionalSearchKey } from "@/lib/offline/order-number";
import { sendOrderStatusEmail } from "@/lib/order-notifications";
import { discountCeiling } from "@/lib/utils/discounts";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import {
  detectOversells,
  type StockConflictSource,
  type StockLine,
} from "@/lib/utils/inventory-conflicts";
import { earnLoyaltyForOrder, reverseLoyaltyForOrder } from "@/lib/utils/loyalty";
import { computeOrderTotals } from "@/lib/utils/order-pricing";
import { describeTaxVariance, resolveQueuedDiscount } from "@/lib/utils/queued-pricing";

// Serialize a Prisma Order (with included relations) into the shape the
// React Query `Order` interface expects: Decimal -> number, Date -> ISO string.
function serializeOrderRead(
  order: POrder & {
    customer: PCustomer | null;
    items: Array<
      POItem & {
        product: { id: string; name: string; images: Array<{ url: string }> } | null;
        variant: { id: string; name: string } | null;
      }
    >;
  }
) {
  return {
    id: order.id,
    spaceId: order.spaceId,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    source: order.source,
    paymentMethod: order.paymentMethod,
    status: order.status,
    discountCode: order.discountCode,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    discount: Number(order.discount),
    total: Number(order.total),
    totalCost: Number(order.totalCost),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          email: order.customer.email,
          phone: order.customer.phone,
        }
      : null,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      total: Number(item.total),
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            images: item.product.images.map((im) => ({ url: im.url })),
          }
        : undefined,
      variant: item.variant ?? null,
    })),
  };
}

export interface ListOrdersFilters {
  search?: string;
  status?: string;
  source?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

/**
 * The request-id tails a search string could be asking for: the tail of a full
 * `OFF-` reference, or four characters typed on their own.
 *
 * Empty for anything else, so an ordinary name search does not turn into a
 * suffix scan of every order.
 */
function providedSearchTails(search: string): string[] {
  const trimmed = search.trim().toUpperCase();
  const fromReference = provisionalSearchKey(trimmed);
  if (fromReference) return [fromReference];
  if (isProvisionalSuffix(trimmed)) return [trimmed];
  return [];
}

export async function listOrders(spaceId: string, filters: ListOrdersFilters = {}) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_orders");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const status = filters.status;
    const source = filters.source;
    const customerId = filters.customerId;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    // Build where clause
    const where: Prisma.OrderWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
          // A sale rung offline printed a provisional OFF-20260826-K7Q2
          // reference and then took a real ORD- number at sync. The paper in
          // the customer's hand is the only link between the two, so the last
          // four characters of the request id have to be searchable — whether
          // they type the whole reference or just the tail.
          ...providedSearchTails(search).map((tail) => ({
            clientRequestId: { endsWith: tail },
          })),
        ],
      }),
      ...(status && status !== "all" && { status: status as Prisma.EnumOrderStatusFilter }),
      ...(source && source !== "all" && { source: source as Prisma.EnumOrderSourceFilter }),
      ...(customerId && { customerId }),
    };

    // Execute queries in parallel
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: true,
          items: {
            include: {
              product: {
                select: { id: true, name: true, images: { where: { isPrimary: true }, take: 1 } },
              },
              variant: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return actionSuccess(
      {
        orders: orders.map(serializeOrderRead),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Orders fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return actionError("Failed to fetch orders");
  }
}

export async function getOrder(spaceId: string, id: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_orders");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id, spaceId },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!order) {
      return actionError("Order not found");
    }

    // Calculate profit: revenue (total minus tax) minus cost
    const profit = Number(order.total) - Number(order.tax) - Number(order.totalCost);

    return actionSuccess(
      {
        order: {
          ...serializeOrderRead(order),
          profit,
        },
      },
      "Order fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching order:", error);
    return actionError("Failed to fetch order");
  }
}

// Validation schemas
const orderItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional().nullable(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
});

const createOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  source: z.enum(["walk_in", "pos", "storefront", "manual"]).default("pos"),
  paymentMethod: z.enum(["cash", "card", "transfer", "pos", "other"]).optional().nullable(),
  status: z
    .enum(["pending", "confirmed", "processing", "completed", "cancelled", "refunded"])
    .default("pending"),
  items: z.array(orderItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  discountCode: z.string().optional().nullable(),
  notes: z.string().optional(),
  // Minted by the client before the write leaves the device. Present on every
  // POS sale so a retry that cannot be distinguished from a first attempt
  // lands on the same order rather than creating a second one.
  clientRequestId: z.string().min(1).max(64).optional(),
  /**
   * True when this sale was rung while the device was offline and is only now
   * reaching the server. Not persisted on the order — it exists so a stock
   * discrepancy can say where it came from, and a run of them after an outage
   * is recognisable as one rather than looking like a bad afternoon.
   */
  queuedOffline: z.boolean().optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "processing", "completed", "cancelled", "refunded"]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * An order as both write paths return it: the row plus its customer and items.
 */
type OrderWithLines = POrder & {
  customer: PCustomer | null;
  items: POItem[];
};

// Helper to serialize Prisma Decimal fields to numbers and Dates to ISO
// strings, matching serializeOrderRead and the `Order` interface the query
// layer declares. Callers render these directly; a Date here would mean the
// same field arriving as a Date from one hook and a string from another.
function serializeOrder(order: OrderWithLines) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    discount: Number(order.discount),
    total: Number(order.total),
    totalCost: Number(order.totalCost),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      total: Number(item.total),
    })),
  };
}

// Generate order number
async function generateOrderNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const lastOrder = await tx.order.findFirst({
    where: {
      spaceId,
      orderNumber: { startsWith: `ORD-${dateStr}` },
    },
    orderBy: { orderNumber: "desc" },
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `ORD-${dateStr}-${sequence.toString().padStart(4, "0")}`;
}

export async function createOrder(spaceId: string, input: CreateOrderInput) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // queuedOffline is metadata about the request, not a column: pull it out
    // before orderData is spread into the create.
    const { items, queuedOffline, ...orderData } = parsed.data;
    const clientRequestId = orderData.clientRequestId ?? null;

    // Idempotent replay. A queued sale can be dispatched twice — a timeout
    // that actually succeeded, two tabs draining the same outbox — and the
    // server cannot tell the second attempt from the first. Returning the
    // existing order here is also what keeps the replay from incrementing
    // discount usage, writing a second DiscountUsage row, awarding loyalty
    // twice, or decrementing stock again: none of that is reached.
    if (clientRequestId) {
      const existing = await prisma.order.findUnique({
        where: { spaceId_clientRequestId: { spaceId, clientRequestId } },
        include: { customer: true, items: true },
      });
      if (existing) {
        // Returning the existing order is the whole contract, so it is returned
        // even when the payload differs. But a differing payload means a client
        // reused a key across an edited cart, which is a bug that shows up as
        // an item going unbilled — log it loudly rather than let it be silent.
        if (Number(existing.subtotal) !== orderData.subtotal) {
          console.error(
            `Replayed clientRequestId ${clientRequestId} on order ${existing.orderNumber} ` +
              `with a different subtotal (stored ${Number(existing.subtotal)}, sent ${orderData.subtotal}). ` +
              `The client reused a key across an edited cart.`
          );
        }
        return actionSuccess(serializeOrder(existing), "Order already recorded");
      }
    }

    const totalCost = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

    // Price a queued sale by the receipt, and a fresh one by the settings.
    //
    // The rules — and the bounds that stop "this was queued offline" being a
    // licence to write your own price — live in `queued-pricing.ts`, pure and
    // tested. Here is only the data-gathering they need.
    let validatedDiscount = orderData.discount;
    let discountNote: string | null = null;

    if (orderData.discountCode) {
      const { validateDiscountCode } = await import("@/lib/actions/commerce/discounts");
      const validation = await validateDiscountCode(
        spaceId,
        orderData.discountCode,
        orderData.subtotal,
        orderData.customerId || undefined,
        items.map((i) => i.productId)
      );
      const serverAmount = validation.success ? validation.data.discountAmount : 0;

      // Only fetched when the claim could actually be honoured, so an ordinary
      // online sale does not pay for a second discount lookup.
      const ceiling =
        queuedOffline && orderData.discount !== serverAmount
          ? await discountCeiling(prisma, {
              spaceId,
              code: orderData.discountCode,
              orderTotal: orderData.subtotal,
            })
          : 0;

      const resolved = resolveQueuedDiscount({
        queuedOffline: queuedOffline ?? false,
        clientRequestId,
        claimed: orderData.discount,
        serverAmount,
        ceiling,
        code: orderData.discountCode,
      });
      validatedDiscount = resolved.amount;
      discountNote = resolved.note;
    }

    // Price the order from the space's own settings rather than from the
    // client's `tax` figure. The storefront quote and the storefront order
    // route already agree on computeOrderTotals; the POS path used to add
    // `subtotal + tax - discount` with whatever tax the browser sent, which
    // ignored taxOnDiscountedAmount entirely. The same cart could therefore
    // total differently depending on which door it came through.
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { taxRate: true, taxOnDiscountedAmount: true },
    });

    const totals = computeOrderTotals({
      subtotal: orderData.subtotal,
      discount: validatedDiscount,
      taxRate: Number(settings?.taxRate ?? 0),
      taxOnDiscountedAmount: settings?.taxOnDiscountedAmount ?? true,
    });

    // Tax is always the server's figure, including on a replay — see
    // `describeTaxVariance` for why the receipt cannot win this one. A
    // difference is recorded rather than applied.
    const taxNote = describeTaxVariance({
      queuedOffline: queuedOffline ?? false,
      clientRequestId,
      claimed: orderData.tax,
      live: totals.tax,
    });

    // Create order with items in a transaction.
    // Retry on unique constraint violation (P2002) for order number race conditions.
    const MAX_RETRIES = 3;
    let lastError: unknown;
    let order: OrderWithLines | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        order = await prisma.$transaction(
          async (tx) => {
            const orderNumber = await generateOrderNumber(tx, spaceId);

            const newOrder = await tx.order.create({
              data: {
                spaceId,
                orderNumber,
                ...orderData,
                // Appended rather than replacing: whatever the cashier typed at
                // the till is still the more useful half of this field.
                notes:
                  discountNote || taxNote
                    ? [orderData.notes, discountNote, taxNote].filter(Boolean).join("\n")
                    : orderData.notes,
                tax: totals.tax,
                discount: totals.discount,
                total: totals.total,
                totalCost,
                items: {
                  create: items.map((item) => ({
                    ...item,
                    total: item.unitPrice * item.quantity,
                  })),
                },
              },
              include: {
                customer: true,
                items: true,
              },
            });

            // Award loyalty points atomically with the order; persist what was
            // earned on the order itself so cancellations can reverse exactly
            if (orderData.customerId) {
              const loyaltyPointsEarned = await earnLoyaltyForOrder(tx, {
                spaceId,
                customerId: orderData.customerId,
                orderId: newOrder.id,
                orderNumber,
                orderTotal: totals.total,
              });
              if (loyaltyPointsEarned > 0) {
                await tx.order.update({
                  where: { id: newOrder.id },
                  data: { loyaltyPointsEarned },
                });
                newOrder.loyaltyPointsEarned = loyaltyPointsEarned;
              }
            }

            // Stock. Resolve each line to its inventory item, read the stock as
            // it stands *inside this transaction*, and decide before writing.
            const inventoryItems = await tx.inventoryItem.findMany({
              where: {
                spaceId,
                productId: { in: items.map((item) => item.productId) },
              },
              select: { id: true, productId: true, variantId: true },
            });

            const itemByKey = new Map(
              inventoryItems.map((inv) => [`${inv.productId}:${inv.variantId ?? "base"}`, inv.id])
            );

            const stockLines: StockLine[] = items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
              inventoryItemId:
                itemByKey.get(`${item.productId}:${item.variantId ?? "base"}`) ?? null,
            }));

            // Aggregated through `tx`, not the module client: reading stock from
            // outside the transaction reads a different snapshot than the one
            // about to be written to, which is exactly the wrong basis for
            // deciding whether a sale oversells.
            const stockBefore = await getStockByInventoryItems(
              stockLines
                .map((line) => line.inventoryItemId)
                .filter((id): id is string => id !== null),
              tx
            );

            const conflicts = detectOversells(stockLines, stockBefore);

            // Write the movement regardless. The sale happened at the counter —
            // the customer has the goods and the cash is in the drawer — so
            // refusing it here destroys a real transaction to protect a number.
            // The number is what is wrong, and the conflict row is how someone
            // finds out.
            // Indexed rather than matched back by product: `stockLines` is built
            // with `items.map`, so position is the pairing. Looking the item up
            // by productId/variantId would silently take the first of two lines
            // that resolve to the same inventory item and book the wrong cost
            // against one of them.
            for (const [index, line] of stockLines.entries()) {
              if (!line.inventoryItemId) continue;
              await tx.inventoryMovement.create({
                data: {
                  inventoryItemId: line.inventoryItemId,
                  type: "sale",
                  quantity: -line.quantity, // Negative for sale
                  reference: newOrder.id,
                  referenceType: "order",
                  costAtTime: items[index].unitCost ?? 0,
                },
              });
            }

            if (conflicts.length > 0) {
              await tx.stockConflict.createMany({
                data: conflicts.map((conflict) => ({
                  spaceId,
                  orderId: newOrder.id,
                  productId: conflict.productId,
                  variantId: conflict.variantId,
                  inventoryItemId: conflict.inventoryItemId,
                  kind: conflict.kind,
                  quantityOrdered: conflict.quantityOrdered,
                  stockBefore: conflict.stockBefore,
                  stockAfter: conflict.stockAfter,
                  // A sale that was queued offline is recorded as "sync"
                  // whatever till rang it: a run of these arriving together is
                  // what an outage looks like from the stock side.
                  source: (queuedOffline ? "sync" : orderData.source) satisfies StockConflictSource,
                })),
              });
            }

            // Track discount code usage if one was used
            if (orderData.discountCode) {
              const discount = await tx.discount.findFirst({
                where: {
                  spaceId,
                  code: orderData.discountCode,
                },
              });

              if (discount) {
                // Increment usage count
                await tx.discount.update({
                  where: { id: discount.id },
                  data: { usageCount: { increment: 1 } },
                });

                // Track per-customer usage if customer is specified
                if (orderData.customerId) {
                  const existingUsage = await tx.discountUsage.findUnique({
                    where: {
                      discountId_customerId: {
                        discountId: discount.id,
                        customerId: orderData.customerId,
                      },
                    },
                  });

                  if (existingUsage) {
                    await tx.discountUsage.update({
                      where: { id: existingUsage.id },
                      data: { usageCount: { increment: 1 } },
                    });
                  } else {
                    await tx.discountUsage.create({
                      data: {
                        discountId: discount.id,
                        customerId: orderData.customerId,
                        orderId: newOrder.id,
                        usageCount: 1,
                      },
                    });
                  }
                }
              }
            }

            return newOrder;
          },
          {
            timeout: 30000, // 30 seconds to handle multiple inventory movements
          }
        );
        break; // Success — exit retry loop
      } catch (err) {
        lastError = err;

        // A concurrent request carrying the same idempotency key won the race.
        // Return its order. Retrying here is precisely how one sale becomes
        // two, so this is checked before the order-number retry below.
        if (clientRequestId && isClientRequestIdConflict(err)) {
          const existing = await prisma.order.findUnique({
            where: { spaceId_clientRequestId: { spaceId, clientRequestId } },
            include: { customer: true, items: true },
          });
          if (existing) {
            return actionSuccess(serializeOrder(existing), "Order already recorded");
          }
        }

        // Order number collision — retry with a fresh one.
        if (isUniqueViolation(err)) {
          continue;
        }
        throw err; // Non-retryable error
      }
    }

    if (!order) {
      throw lastError ?? new Error("Failed to create order after retries");
    }

    revalidatePath("/commerce/orders");
    revalidatePath("/commerce/pos");
    revalidatePath("/commerce/discounts");
    return actionSuccess(serializeOrder(order), "Order created");
  } catch (error) {
    console.error("Error creating order:", error);
    return actionError("Failed to create order");
  }
}

export async function updateOrderStatus(spaceId: string, orderId: string, status: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateOrderStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return actionError("Invalid status");
  }

  try {
    // Wrap status update + inventory/loyalty reversal in a transaction
    const { order, previousStatus } = await prisma.$transaction(
      async (tx) => {
        const existingOrder = await tx.order.findFirst({
          where: { id: orderId, spaceId },
        });
        if (!existingOrder) {
          throw new Error("Order not found");
        }

        const updatedOrder = await tx.order.update({
          where: { id: orderId, spaceId },
          data: { status: parsed.data.status },
          include: { customer: true, items: true },
        });

        // If cancelled or refunded, reverse inventory movements and loyalty
        // points — only on the first transition (a cancelled→refunded change
        // must not re-add stock or deduct points twice)
        const alreadyReversed =
          existingOrder.status === "cancelled" || existingOrder.status === "refunded";
        if (
          !alreadyReversed &&
          (parsed.data.status === "cancelled" || parsed.data.status === "refunded")
        ) {
          const existingMovements = await tx.inventoryMovement.findMany({
            where: {
              reference: orderId,
              referenceType: "order",
              type: "sale",
            },
          });

          for (const movement of existingMovements) {
            await tx.inventoryMovement.create({
              data: {
                inventoryItemId: movement.inventoryItemId,
                type: parsed.data.status === "refunded" ? "refund" : "return_stock",
                quantity: Math.abs(movement.quantity),
                reference: orderId,
                referenceType: parsed.data.status === "refunded" ? "refund" : "adjustment",
                notes: `${parsed.data.status === "refunded" ? "Refund" : "Cancellation"} for order ${updatedOrder.orderNumber}`,
              },
            });
          }

          await reverseLoyaltyForOrder(tx, existingOrder);
        }

        return { order: updatedOrder, previousStatus: existingOrder.status };
      },
      { timeout: 30000 }
    );

    // Tell the customer, but only when the status genuinely moved — saving the
    // same status twice shouldn't re-send. Not awaited into the response path:
    // the status change is already committed and a mail outage must not surface
    // as a failed update.
    if (previousStatus !== order.status) {
      // `after` rather than a bare `void`: on a serverless host the instance can
      // freeze as soon as the response is sent, silently dropping the send.
      after(() =>
        sendOrderStatusEmail({
          orderId: order.id,
          orderNumber: order.orderNumber,
          spaceId,
          status: order.status,
          customerName: order.customer?.name || "there",
          customerEmail: order.customer?.email,
          total: Number(order.total),
        })
      );
    }

    revalidatePath("/commerce/orders");
    revalidatePath(`/commerce/orders/${orderId}`);
    return actionSuccess(serializeOrder(order), "Order status updated");
  } catch (error) {
    console.error("Error updating order status:", error);
    return actionError("Failed to update order status");
  }
}

export async function deleteOrder(spaceId: string, orderId: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Only allow deleting pending orders
    const order = await prisma.order.findFirst({
      where: { id: orderId, spaceId },
    });

    if (!order) {
      return actionError("Order not found");
    }

    if (order.status !== "pending") {
      return actionError("Only pending orders can be deleted");
    }

    // Delete inventory movements and order
    await prisma.$transaction([
      prisma.inventoryMovement.deleteMany({
        where: { reference: orderId, referenceType: "order" },
      }),
      prisma.order.delete({
        where: { id: orderId, spaceId },
      }),
    ]);

    revalidatePath("/commerce/orders");
    return actionSuccess(null, "Order deleted");
  } catch (error) {
    console.error("Error deleting order:", error);
    return actionError("Failed to delete order");
  }
}
