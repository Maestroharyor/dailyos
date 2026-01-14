"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

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
  status: z.enum(["pending", "confirmed", "processing", "completed", "cancelled", "refunded"]).default("pending"),
  items: z.array(orderItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  discountCode: z.string().optional().nullable(),
  notes: z.string().optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "processing", "completed", "cancelled", "refunded"]),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// Helper to serialize Prisma Decimal fields to numbers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOrder(order: any) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    discount: Number(order.discount),
    total: Number(order.total),
    totalCost: Number(order.totalCost),
    items: order.items?.map((item: { unitPrice: unknown; unitCost: unknown; total: unknown }) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      unitCost: Number(item.unitCost),
      total: Number(item.total),
    })),
  };
}

// Generate order number
async function generateOrderNumber(spaceId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const lastOrder = await prisma.order.findFirst({
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const { items, ...orderData } = parsed.data;

    // Calculate totals
    const total = orderData.subtotal + orderData.tax - orderData.discount;
    const totalCost = items.reduce(
      (sum, item) => sum + item.unitCost * item.quantity,
      0
    );

    // Generate order number
    const orderNumber = await generateOrderNumber(spaceId);

    // Create order with items in a transaction
    // Increase timeout to handle multiple inventory movements
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          spaceId,
          orderNumber,
          ...orderData,
          total,
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

      // Create inventory movements for sale
      for (const item of items) {
        const inventoryItem = await tx.inventoryItem.findFirst({
          where: {
            spaceId,
            productId: item.productId,
            variantId: item.variantId ?? null,
          },
        });

        if (inventoryItem) {
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: "sale",
              quantity: -item.quantity, // Negative for sale
              reference: newOrder.id,
              referenceType: "order",
              costAtTime: item.unitCost,
            },
          });
        }
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
    }, {
      timeout: 30000, // 30 seconds to handle multiple inventory movements
    });

    revalidatePath("/commerce/orders");
    revalidatePath("/commerce/pos");
    revalidatePath("/commerce/discounts");
    return { success: true, order: serializeOrder(order) };
  } catch (error) {
    console.error("Error creating order:", error);
    return { error: "Failed to create order" };
  }
}

export async function updateOrderStatus(
  spaceId: string,
  orderId: string,
  status: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateOrderStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return { error: "Invalid status" };
  }

  try {
    const order = await prisma.order.update({
      where: { id: orderId, spaceId },
      data: { status: parsed.data.status },
      include: { customer: true, items: true },
    });

    // If cancelled or refunded, reverse inventory movements
    if (parsed.data.status === "cancelled" || parsed.data.status === "refunded") {
      const existingMovements = await prisma.inventoryMovement.findMany({
        where: {
          reference: orderId,
          referenceType: "order",
          type: "sale",
        },
      });

      for (const movement of existingMovements) {
        await prisma.inventoryMovement.create({
          data: {
            inventoryItemId: movement.inventoryItemId,
            type: parsed.data.status === "refunded" ? "refund" : "return_stock",
            quantity: Math.abs(movement.quantity), // Positive to add back stock
            reference: orderId,
            referenceType: parsed.data.status === "refunded" ? "refund" : "adjustment",
            notes: `${parsed.data.status === "refunded" ? "Refund" : "Cancellation"} for order ${order.orderNumber}`,
          },
        });
      }
    }

    revalidatePath("/commerce/orders");
    revalidatePath(`/commerce/orders/${orderId}`);
    return { success: true, order: serializeOrder(order) };
  } catch (error) {
    console.error("Error updating order status:", error);
    return { error: "Failed to update order status" };
  }
}

export async function deleteOrder(spaceId: string, orderId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Only allow deleting pending orders
    const order = await prisma.order.findFirst({
      where: { id: orderId, spaceId },
    });

    if (!order) {
      return { error: "Order not found" };
    }

    if (order.status !== "pending") {
      return { error: "Only pending orders can be deleted" };
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
    return { success: true };
  } catch (error) {
    console.error("Error deleting order:", error);
    return { error: "Failed to delete order" };
  }
}
