"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { actionSuccess, actionError } from "@/lib/action-response";
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

// Serialize a Prisma Return for the React Flight boundary (Decimal -> number,
// Date -> ISO string). Included items must be serialized by the caller.
function serializeReturn(
  r: NonNullable<Awaited<ReturnType<typeof prisma.return.findUnique>>>
) {
  return {
    ...r,
    refundAmount: Number(r.refundAmount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// Generate return number: RET-YYYYMMDD-XXXX (accepts tx for transaction safety)
async function generateReturnNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  spaceId: string
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const count = await tx.return.count({
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
  const authResult = await authorizeAction(spaceId, "refund_order");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createReturnSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Verify order exists
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId, spaceId },
      include: { items: true },
    });

    if (!order) {
      return actionError("Order not found");
    }

    if (order.status !== "completed") {
      return actionError("Can only create returns for completed orders");
    }

    // Verify items are from this order and quantities don't exceed ordered amounts
    for (const returnItem of parsed.data.items) {
      const orderItem = order.items.find(
        (oi) =>
          oi.productId === returnItem.productId &&
          oi.variantId === returnItem.variantId
      );

      if (!orderItem) {
        return actionError(`Item ${returnItem.name} was not in this order`);
      }

      if (returnItem.quantity > orderItem.quantity) {
        return actionError(`Return quantity for ${returnItem.name} exceeds ordered quantity`);
      }
    }

    // Calculate refund amount
    const refundAmount = parsed.data.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    const returnRecord = await prisma.$transaction(async (tx) => {
      const returnNumber = await generateReturnNumber(tx, spaceId);

      return tx.return.create({
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
    });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/orders/${parsed.data.orderId}`);
    return actionSuccess(
      {
        ...serializeReturn(returnRecord),
        items: returnRecord.items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
      },
      "Return created"
    );
  } catch (error) {
    console.error("Error creating return:", error);
    return actionError("Failed to create return");
  }
}

export async function updateReturnStatus(
  spaceId: string,
  returnId: string,
  status: ReturnStatus
) {
  const authResult = await authorizeAction(spaceId, "refund_order");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const returnRecord = await tx.return.findUnique({
        where: { id: returnId, spaceId },
        include: { items: true },
      });

      if (!returnRecord) {
        throw new Error("Return not found");
      }

      // If approving, process the return
      if (status === "approved" && returnRecord.status === "pending") {
        // If restocking, create inventory movements
        if (returnRecord.restockItems) {
          for (const item of returnRecord.items) {
            // Product deleted since the return was created (FK SetNull) —
            // nothing to restock against
            if (!item.productId) continue;

            const inventoryItem = await tx.inventoryItem.upsert({
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

            await tx.inventoryMovement.create({
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

        // Add store credit if customer exists
        if (returnRecord.customerId) {
          await tx.customer.update({
            where: { id: returnRecord.customerId },
            data: {
              storeCredit: { increment: returnRecord.refundAmount },
            },
          });
        }
      }

      return tx.return.update({
        where: { id: returnId },
        data: { status },
      });
    }, { timeout: 30000 });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/returns/${returnId}`);
    revalidatePath("/commerce/inventory");
    return actionSuccess(serializeReturn(updated), "Return status updated");
  } catch (error) {
    console.error("Error updating return status:", error);
    if (error instanceof Error && error.message === "Return not found") {
      return actionError("Return not found");
    }
    return actionError("Failed to update return status");
  }
}

export async function completeReturn(spaceId: string, returnId: string) {
  const authResult = await authorizeAction(spaceId, "refund_order");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId, spaceId },
    });

    if (!returnRecord) {
      return actionError("Return not found");
    }

    if (returnRecord.status !== "approved") {
      return actionError("Return must be approved before completing");
    }

    const updated = await prisma.return.update({
      where: { id: returnId },
      data: { status: "completed" },
    });

    revalidatePath("/commerce/returns");
    revalidatePath(`/commerce/returns/${returnId}`);
    return actionSuccess(serializeReturn(updated), "Return completed");
  } catch (error) {
    console.error("Error completing return:", error);
    return actionError("Failed to complete return");
  }
}
