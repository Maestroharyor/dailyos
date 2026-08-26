"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { toStockConflictKind, toStockConflictSource } from "@/lib/utils/inventory-conflicts";

/**
 * Stock discrepancies a sale left behind, and how a merchant closes them.
 *
 * Nothing here corrects stock on its own. "Accept the sale, flag it" was the
 * decision, and an automatic correction would hide a discrepancy that has a
 * physical cause — a miscount, a theft, a delivery nobody booked in — that
 * someone in the shop has to go and look at.
 */

export async function listStockConflicts(
  spaceId: string,
  options: { includeResolved?: boolean } = {}
) {
  const authResult = await authorizeAction(spaceId, "view_inventory");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const conflicts = await prisma.stockConflict.findMany({
      where: {
        spaceId,
        ...(options.includeResolved ? {} : { resolvedAt: null }),
      },
      include: {
        order: { select: { id: true, orderNumber: true, createdAt: true } },
        product: { select: { id: true, name: true, sku: true } },
        variant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return actionSuccess(
      {
        conflicts: conflicts.map((conflict) => ({
          id: conflict.id,
          orderId: conflict.orderId,
          orderNumber: conflict.order.orderNumber,
          productName: conflict.product.name,
          productSku: conflict.product.sku,
          variantName: conflict.variant?.name ?? null,
          inventoryItemId: conflict.inventoryItemId,
          kind: toStockConflictKind(conflict.kind),
          quantityOrdered: conflict.quantityOrdered,
          stockBefore: conflict.stockBefore,
          stockAfter: conflict.stockAfter,
          source: toStockConflictSource(conflict.source),
          resolvedAt: conflict.resolvedAt?.toISOString() ?? null,
          resolutionNote: conflict.resolutionNote,
          createdAt: conflict.createdAt.toISOString(),
        })),
      },
      "Stock conflicts fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching stock conflicts:", error);
    return actionError("Failed to fetch stock conflicts");
  }
}

const resolveSchema = z.object({
  conflictId: z.string().min(1),
  note: z.string().max(500).optional(),
});

export type ResolveStockConflictInput = z.infer<typeof resolveSchema>;

/**
 * Mark a discrepancy as looked at.
 *
 * Deliberately only an acknowledgement. Correcting the stock is a separate,
 * visible act through `adjustStock`, which writes a movement someone can find
 * later — folding it in here would make a correction that leaves no trace of
 * why it happened.
 */
export async function resolveStockConflict(spaceId: string, input: ResolveStockConflictInput) {
  const authResult = await authorizeAction(spaceId, "adjust_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const conflict = await prisma.stockConflict.findFirst({
      where: { id: parsed.data.conflictId, spaceId },
    });
    if (!conflict) {
      return actionError("Stock conflict not found");
    }
    if (conflict.resolvedAt) {
      return actionSuccess({ id: conflict.id }, "Already resolved");
    }

    await prisma.stockConflict.update({
      where: { id: conflict.id },
      data: {
        resolvedAt: new Date(),
        resolvedById: authResult.ctx.userId,
        resolutionNote: parsed.data.note,
      },
    });

    revalidatePath("/commerce/sync");
    return actionSuccess({ id: conflict.id }, "Marked as resolved");
  } catch (error) {
    console.error("Error resolving stock conflict:", error);
    return actionError("Failed to resolve stock conflict");
  }
}
