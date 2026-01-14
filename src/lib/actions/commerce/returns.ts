"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import type { ReturnStatus, ReturnReason } from "@prisma/client";

// Validation schemas
const returnItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional().nullable(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const createReturnSchema = z.object({
  orderId: z.string(),
  customerId: z.string().optional().nullable(),
  reason: z.enum(["defective", "wrong_item", "not_as_described", "changed_mind", "damaged", "other"]),
  items: z.array(returnItemSchema).min(1, "At least one item is required"),
  notes: z.string().optional().nullable(),
  restockItems: z.boolean().default(true),
});

export type CreateReturnInput = z.infer<typeof createReturnSchema>;

// Generate return number: RET-YYYYMMDD-XXXX
async function generateReturnNumber(spaceId: string): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const count = await prisma.return.count({
    where: {
      spaceId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `RET-${dateStr}-${sequence}`;
}

export async function createReturn(spaceId: string, input: CreateReturnInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Verify order exists
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId, spaceId },
      include: { items: true },
    });

    if (!order) {
      return { error: "Order not found" };
    }

    if (order.status !== "completed") {
      return { error: "Can only create returns for completed orders" };
    }

    // Verify items are from this order and quantities don't exceed ordered amounts
    for (const returnItem of parsed.data.items) {
      const orderItem = order.items.find(
        (oi) =>
          oi.productId === returnItem.productId &&
          oi.variantId === returnItem.variantId
      );

      if (!orderItem) {
        return { error: `Item ${returnItem.name} was not in this order` };
      }

      if (returnItem.quantity > orderItem.quantity) {
        return {
          error: `Return quantity for ${returnItem.name} exceeds ordered quantity`,
        };
      }
    }

    const returnNumber = await generateReturnNumber(spaceId);

    // Calculate refund amount
    const refundAmount = parsed.data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    const returnRecord = await prisma.return.create({
      data: {
        spaceId,
        returnNumber,
        orderId: parsed.data.orderId,
        customerId: parsed.data.customerId,
        reason: parsed.data.reason as ReturnReason,
        notes: parsed.data.notes,
        restockItems: parsed.data.restockItems,
        refundAmount,
        items: {
          create: parsed.data.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/orders/${parsed.data.orderId}`);
    return { success: true, return: returnRecord };
  } catch (error) {
    console.error("Error creating return:", error);
    return { error: "Failed to create return" };
  }
}

export async function updateReturnStatus(
  spaceId: string,
  returnId: string,
  status: ReturnStatus
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, spaceId },
      include: { items: true },
    });

    if (!returnRecord) {
      return { error: "Return not found" };
    }

    // If approving, process the return
    if (status === "approved" && returnRecord.status === "pending") {
      // If restocking, create inventory movements
      if (returnRecord.restockItems) {
        for (const item of returnRecord.items) {
          // Find or create inventory item
          const inventoryItem = await prisma.inventoryItem.upsert({
            where: {
              spaceId_productId_variantId_location: {
                spaceId,
                productId: item.productId,
                variantId: item.variantId ?? "",
                location: "default",
              },
            },
            update: {},
            create: {
              spaceId,
              productId: item.productId,
              variantId: item.variantId,
              location: "default",
            },
          });

          // Create return stock movement
          await prisma.inventoryMovement.create({
            data: {
              inventoryItemId: inventoryItem.id,
              type: "return_stock",
              quantity: item.quantity,
              reference: returnRecord.returnNumber,
              referenceType: "refund",
              notes: `Return from order ${returnRecord.orderId}`,
            },
          });
        }
      }

      // If customer has store credit enabled, add to their balance
      if (returnRecord.customerId) {
        await prisma.customer.update({
          where: { id: returnRecord.customerId },
          data: {
            storeCredit: { increment: returnRecord.refundAmount },
          },
        });
      }
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: { status },
    });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/returns/${returnId}`);
    revalidatePath("/commerce/inventory");
    return { success: true, return: updated };
  } catch (error) {
    console.error("Error updating return status:", error);
    return { error: "Failed to update return status" };
  }
}

export async function completeReturn(spaceId: string, returnId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, spaceId },
    });

    if (!returnRecord) {
      return { error: "Return not found" };
    }

    if (returnRecord.status !== "approved") {
      return { error: "Return must be approved before completing" };
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: { status: "completed" },
    });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/returns/${returnId}`);
    return { success: true, return: updated };
  } catch (error) {
    console.error("Error completing return:", error);
    return { error: "Failed to complete return" };
  }
}
