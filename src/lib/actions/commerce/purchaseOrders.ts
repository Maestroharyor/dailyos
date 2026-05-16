"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
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

// Generate PO number: PO-YYYYMMDD-XXXX (accepts tx for transaction safety)
async function generatePONumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const count = await tx.purchaseOrder.count({
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
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Calculate totals
    const subtotal = parsed.data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCost,
      0
    );
    const total = subtotal + parsed.data.tax + parsed.data.shipping;

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const orderNumber = await generatePONumber(tx, spaceId);

      return tx.purchaseOrder.create({
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
    });

    revalidatePath("/commerce/purchase-orders");
    return actionSuccess(purchaseOrder, "Purchase order created");
  } catch (error) {
    console.error("Error creating purchase order:", error);
    return actionError("Failed to create purchase order");
  }
}

export async function updatePurchaseOrderStatus(
  spaceId: string,
  purchaseOrderId: string,
  status: PurchaseOrderStatus
) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId, spaceId },
      data: { status },
    });

    revalidatePath("/commerce/purchase-orders");
    revalidatePath(`/commerce/purchase-orders/${purchaseOrderId}`);
    return actionSuccess(purchaseOrder, "Purchase order status updated");
  } catch (error) {
    console.error("Error updating purchase order status:", error);
    return actionError("Failed to update purchase order status");
  }
}

export async function receiveItems(
  spaceId: string,
  purchaseOrderId: string,
  input: ReceiveItemsInput
) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = receiveItemsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Get the purchase order with items
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId, spaceId },
      include: { items: true },
    });

    if (!purchaseOrder) {
      return actionError("Purchase order not found");
    }

    // Wrap all mutations in a transaction
    await prisma.$transaction(async (tx) => {
      for (const receivedItem of parsed.data.items) {
        const poItem = purchaseOrder.items.find((i) => i.id === receivedItem.itemId);
        if (!poItem) continue;

        await tx.purchaseOrderItem.update({
          where: { id: receivedItem.itemId },
          data: { receivedQty: { increment: receivedItem.receivedQty } },
        });

        const inventoryItem = await tx.inventoryItem.upsert({
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

        await tx.inventoryMovement.create({
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
      const updatedPO = await tx.purchaseOrder.findUnique({
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
          await tx.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: {
              status: newStatus,
              receivedDate: allReceived ? new Date() : null,
            },
          });
        }
      }
    }, { timeout: 30000 });

    revalidatePath("/commerce/purchase-orders");
    revalidatePath(`/commerce/purchase-orders/${purchaseOrderId}`);
    revalidatePath("/commerce/inventory");
    return actionSuccess(null, "Items received");
  } catch (error) {
    console.error("Error receiving items:", error);
    return actionError("Failed to receive items");
  }
}

export async function deletePurchaseOrder(spaceId: string, purchaseOrderId: string) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId, spaceId },
      include: { items: true },
    });

    if (!purchaseOrder) {
      return actionError("Purchase order not found");
    }

    // Only allow deletion of draft or cancelled orders
    if (purchaseOrder.status !== "draft" && purchaseOrder.status !== "cancelled") {
      return actionError("Can only delete draft or cancelled purchase orders");
    }

    await prisma.purchaseOrder.delete({
      where: { id: purchaseOrderId, spaceId },
    });

    revalidatePath("/commerce/purchase-orders");
    return actionSuccess(null, "Purchase order deleted");
  } catch (error) {
    console.error("Error deleting purchase order:", error);
    return actionError("Failed to delete purchase order");
  }
}
