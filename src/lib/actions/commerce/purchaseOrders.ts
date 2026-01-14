"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import type { PurchaseOrderStatus } from "@prisma/client";

// Validation schemas
const purchaseOrderItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional().nullable(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().int().min(1),
  unitCost: z.number().min(0),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.string(),
  items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
  tax: z.number().min(0).default(0),
  shipping: z.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
});

const receiveItemsSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      receivedQty: z.number().int().min(0),
    })
  ),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceiveItemsInput = z.infer<typeof receiveItemsSchema>;

// Generate PO number: PO-YYYYMMDD-XXXX
async function generatePONumber(spaceId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Count POs created today
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const count = await prisma.purchaseOrder.count({
    where: {
      spaceId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `PO-${dateStr}-${sequence}`;
}

export async function createPurchaseOrder(spaceId: string, input: CreatePurchaseOrderInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const orderNumber = await generatePONumber(spaceId);

    // Calculate totals
    const subtotal = parsed.data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0
    );
    const total = subtotal + parsed.data.tax + parsed.data.shipping;

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        spaceId,
        orderNumber,
        supplierId: parsed.data.supplierId,
        subtotal,
        tax: parsed.data.tax,
        shipping: parsed.data.shipping,
        total,
        notes: parsed.data.notes,
        expectedDate: parsed.data.expectedDate ? new Date(parsed.data.expectedDate) : null,
        items: {
          create: parsed.data.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            unitCost: item.unitCost,
            total: item.quantity * item.unitCost,
          })),
        },
      },
      include: {
        items: true,
        supplier: true,
      },
    });

    revalidatePath("/commerce/purchase-orders");
    return { success: true, purchaseOrder };
  } catch (error) {
    console.error("Error creating purchase order:", error);
    return { error: "Failed to create purchase order" };
  }
}

export async function updatePurchaseOrderStatus(
  spaceId: string,
  purchaseOrderId: string,
  status: PurchaseOrderStatus
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId, spaceId },
      data: { status },
    });

    revalidatePath("/commerce/purchase-orders");
    revalidatePath(`/commerce/purchase-orders/${purchaseOrderId}`);
    return { success: true, purchaseOrder };
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    return { error: "Failed to update purchase order status" };
  }
}

export async function receiveItems(
  spaceId: string,
  purchaseOrderId: string,
  input: ReceiveItemsInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = receiveItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Get the purchase order with items
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId, spaceId },
      include: { items: true },
    });

    if (!purchaseOrder) {
      return { error: "Purchase order not found" };
    }

    // Update received quantities and create inventory movements
    for (const receivedItem of parsed.data.items) {
      const poItem = purchaseOrder.items.find((i) => i.id === receivedItem.itemId);
      if (!poItem) continue;

      // Update the PO item
      await prisma.purchaseOrderItem.update({
        where: { id: receivedItem.itemId },
        data: { receivedQty: { increment: receivedItem.receivedQty } },
      });

      // Find or create inventory item
      const inventoryItem = await prisma.inventoryItem.upsert({
        where: {
          spaceId_productId_variantId_location: {
            spaceId,
            productId: poItem.productId,
            variantId: poItem.variantId ?? "",
            location: "default",
          },
        },
        update: {},
        create: {
          spaceId,
          productId: poItem.productId,
          variantId: poItem.variantId,
          location: "default",
        },
      });

      // Create inventory movement
      await prisma.inventoryMovement.create({
        data: {
          inventoryItemId: inventoryItem.id,
          type: "purchase",
          quantity: receivedItem.receivedQty,
          reference: purchaseOrder.orderNumber,
          referenceType: "purchase",
          costAtTime: poItem.unitCost,
          notes: `Received from PO ${purchaseOrder.orderNumber}`,
        },
      });
    }

    // Check if all items are fully received
    const updatedPO = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });

    if (updatedPO) {
      const allReceived = updatedPO.items.every(
        (item) => item.receivedQty >= item.quantity
      );
      const someReceived = updatedPO.items.some((item) => item.receivedQty > 0);

      const newStatus: PurchaseOrderStatus = allReceived
        ? "received"
        : someReceived
        ? "partial"
        : updatedPO.status;

      if (newStatus !== updatedPO.status) {
        await prisma.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            status: newStatus,
            receivedDate: allReceived ? new Date() : null,
          },
        });
      }
    }

    revalidatePath("/commerce/purchase-orders");
    revalidatePath(`/commerce/purchase-orders/${purchaseOrderId}`);
    revalidatePath("/commerce/inventory");
    return { success: true };
  } catch (error) {
    console.error("Error receiving items:", error);
    return { error: "Failed to receive items" };
  }
}

export async function deletePurchaseOrder(spaceId: string, purchaseOrderId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId, spaceId },
      include: { items: true },
    });

    if (!purchaseOrder) {
      return { error: "Purchase order not found" };
    }

    // Only allow deletion of draft or cancelled orders
    if (purchaseOrder.status !== "draft" && purchaseOrder.status !== "cancelled") {
      return { error: "Can only delete draft or cancelled purchase orders" };
    }

    await prisma.purchaseOrder.delete({
      where: { id: purchaseOrderId, spaceId },
    });

    revalidatePath("/commerce/purchase-orders");
    return { success: true };
  } catch (error) {
    console.error("Error deleting purchase order:", error);
    return { error: "Failed to delete purchase order" };
  }
}
