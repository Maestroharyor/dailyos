"use server";

import { revalidatePath } from "next/cache";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { statesMatch } from "@/lib/delivery/states";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { sendPickupReadyEmail } from "@/lib/order-notifications";

/**
 * The store pickup counter: telling a customer their order is ready, recording
 * that they collected it, and releasing what nobody came for.
 *
 * Gated on `edit_orders` rather than `manage_account_settings`, so whoever
 * actually runs the counter can do this without also being able to reprice the
 * store. Configuring pickup stays owner-only; operating it does not.
 */

/**
 * Marks an order ready and starts its collection deadline.
 *
 * The order of operations is the point. The email is sent first and the
 * timestamp is written only if it went, because the deadline that eventually
 * justifies releasing somebody's paid-for goods runs from the notification. A
 * clock started against a customer who was never told is not a deadline, it is
 * a trap, and a bounced address or a typo is enough to create one.
 */
export async function markPickupReady(spaceId: string, orderId: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const order = await prisma.order.findFirst({
      where: { id: orderId, spaceId },
      include: { customer: { select: { name: true, email: true } } },
    });
    if (!order) {
      return actionError("Order not found");
    }
    if (order.deliveryType !== "store_pickup") {
      return actionError("This order is not a store pickup");
    }
    if (order.pickupCollectedAt || order.pickupReleasedAt) {
      return actionError("This pickup is already closed");
    }
    if (order.pickupNotifiedAt) {
      return actionError("The customer has already been notified");
    }

    const setting = await prisma.storePickupSetting.findUnique({ where: { spaceId } });
    if (!setting) {
      return actionError("Store pickup is not configured");
    }

    const isHome = statesMatch(setting.homeState, order.deliveryState);
    const holdDays = isHome ? setting.homeHoldDays : setting.awayHoldDays;
    const windowLabel = isHome ? setting.homeWindowLabel : setting.awayWindowLabel;

    const customerEmail = order.customer?.email;
    if (!customerEmail) {
      return actionError("This order has no email address to notify");
    }

    const notifiedAt = new Date();
    const deadline = addWorkingDays(notifiedAt, holdDays);

    const sent = await sendPickupReadyEmail({
      orderNumber: order.orderNumber,
      spaceId,
      customerName: order.customer?.name || "there",
      customerEmail,
      // The snapshot first: it is where the customer was told to go at the time
      // they ordered, and the configured address may have changed since.
      pickupAddress: order.deliveryPickupAddress || setting.address || "",
      windowLabel,
      deadline,
      depositAmount: Number(order.depositFee),
    });

    if (!sent) {
      return actionError("Could not send the notification, so the deadline was not started");
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { pickupNotifiedAt: notifiedAt, pickupDeadlineAt: deadline },
      select: { id: true, pickupNotifiedAt: true, pickupDeadlineAt: true },
    });

    revalidatePath(`/commerce/orders/${orderId}`);
    return actionSuccess(
      {
        id: updated.id,
        pickupNotifiedAt: updated.pickupNotifiedAt?.toISOString() ?? null,
        pickupDeadlineAt: updated.pickupDeadlineAt?.toISOString() ?? null,
      },
      "Customer notified, collection window started"
    );
  } catch (error) {
    console.error("Error marking pickup ready:", error);
    return actionError("Failed to mark this order ready for pickup");
  }
}

/**
 * Records that the customer turned up and took their order.
 *
 * Settles the deposit as returned in the same write that records collection, so
 * the money owed back is never a separate thing to remember. It does not move
 * the money: the refund is pushed by hand, and this is what tells whoever does
 * it that it is owed.
 */
export async function markPickupCollected(spaceId: string, orderId: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, spaceId } });
    if (!order) {
      return actionError("Order not found");
    }
    if (order.deliveryType !== "store_pickup") {
      return actionError("This order is not a store pickup");
    }
    if (order.pickupReleasedAt) {
      return actionError("This order was already released");
    }
    if (order.pickupCollectedAt) {
      return actionError("This order is already marked collected");
    }

    const now = new Date();
    const holdingDeposit = order.depositStatus === "held";

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        pickupCollectedAt: now,
        status: "delivered",
        ...(holdingDeposit && { depositStatus: "returned", depositSettledAt: now }),
        statusHistory: {
          create: {
            status: "delivered",
            changedById: authResult.ctx.userId,
            note: holdingDeposit
              ? `Collected in store. Deposit of ${Number(order.depositFee)} to be returned.`
              : "Collected in store.",
          },
        },
      },
      select: { id: true, depositFee: true, depositStatus: true },
    });

    revalidatePath(`/commerce/orders/${orderId}`);
    return actionSuccess(
      {
        id: updated.id,
        depositToReturn: holdingDeposit ? Number(updated.depositFee) : 0,
      },
      holdingDeposit
        ? `Collected. Return ${Number(updated.depositFee)} to the customer.`
        : "Marked as collected"
    );
  } catch (error) {
    console.error("Error marking pickup collected:", error);
    return actionError("Failed to mark this order collected");
  }
}

/**
 * Releases an uncollected order back to stock.
 *
 * Deliberately a button and never a schedule. The policy says the store
 * "reserves the right" to release, which is permission, not an instruction: a
 * customer who turns up late with a good reason should meet a person who can
 * say yes, not an item that a background job already sold. Exercising that
 * right is somebody's decision, so it is somebody's click.
 *
 * Sets `cancelled`, which is the existing transition that returns stock through
 * an inventory movement and reverses loyalty, and records the deposit as
 * forfeited. It moves no money: the refund owed is reported for a human.
 */
export async function releasePickup(spaceId: string, orderId: string) {
  const authResult = await authorizeAction(spaceId, "edit_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const order = await prisma.order.findFirst({ where: { id: orderId, spaceId } });
    if (!order) {
      return actionError("Order not found");
    }
    if (order.deliveryType !== "store_pickup") {
      return actionError("This order is not a store pickup");
    }
    if (order.pickupCollectedAt) {
      return actionError("This order was already collected");
    }
    if (order.pickupReleasedAt) {
      return actionError("This order was already released");
    }
    if (!order.pickupDeadlineAt) {
      return actionError("This order has no collection deadline yet");
    }
    if (order.pickupDeadlineAt > new Date()) {
      return actionError("This order is not past its collection deadline");
    }

    const now = new Date();
    const depositFee = Number(order.depositFee);
    const refundOwed = Number(order.total) - depositFee;

    const result = await prisma.$transaction(async (tx) => {
      // Guarded rather than assumed: two people looking at the same overdue
      // order must not restock it twice.
      //
      // `pickupCollectedAt` is in the guard as well as in the read above,
      // because the read is not what makes this safe. A customer arriving at
      // the counter between that read and this statement would be marked
      // collected, and a claim that only asked about `pickupReleasedAt` would
      // still match: it would cancel an order that was just handed over,
      // restock goods that left the building, and forfeit a deposit that was
      // returned a second earlier.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, spaceId, pickupReleasedAt: null, pickupCollectedAt: null },
        data: { pickupReleasedAt: now, status: "cancelled" },
      });
      if (claimed.count === 0) return null;

      // Conditioned on the row's current value rather than on the snapshot
      // read before the transaction opened, for the same reason. A no-op when
      // the deposit is `none`, which is every pickup in the home state.
      await tx.order.updateMany({
        where: { id: orderId, spaceId, depositStatus: "held" },
        data: { depositStatus: "forfeited", depositSettledAt: now },
      });

      // Same restock path a cancellation takes, so there is one definition of
      // returning an order's stock rather than two that can drift.
      const movements = await tx.inventoryMovement.findMany({
        where: { reference: orderId, referenceType: "order", type: "sale" },
      });
      for (const movement of movements) {
        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: movement.inventoryItemId,
            type: "return_stock",
            quantity: Math.abs(movement.quantity),
            reference: orderId,
            referenceType: "adjustment",
            notes: `Uncollected store pickup released for order ${order.orderNumber}`,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: "cancelled",
          changedById: authResult.ctx.userId,
          note:
            depositFee > 0
              ? `Uncollected past ${order.pickupDeadlineAt?.toISOString().slice(0, 10)}. Released to stock. Refund owed ${refundOwed}, deposit of ${depositFee} retained.`
              : `Uncollected past ${order.pickupDeadlineAt?.toISOString().slice(0, 10)}. Released to stock. Refund owed ${refundOwed}.`,
        },
      });

      return { restocked: movements.length };
    });

    if (!result) {
      return actionError("This order was released by someone else");
    }

    revalidatePath(`/commerce/orders/${orderId}`);
    return actionSuccess(
      { id: orderId, refundOwed, depositForfeited: depositFee, restocked: result.restocked },
      `Released to stock. Refund ${refundOwed} to the customer by hand.`
    );
  } catch (error) {
    console.error("Error releasing pickup:", error);
    return actionError("Failed to release this order");
  }
}

/**
 * On-read catch-up: labels store pickups whose collection deadline has passed.
 *
 * Idempotent and non-destructive by design, in the shape of
 * `materializeRecurring` in the finance module. It restocks nothing, cancels
 * nothing and refunds nothing. All it does is make an overdue order visible so
 * that a person can decide, which is the whole difference between a policy the
 * store may invoke and one that a page load invokes on its behalf.
 *
 * The trade-off is that nothing is flagged while nobody is looking. That is
 * harmless here precisely because flagging is all it does.
 */
export async function flagOverduePickups(spaceId: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_orders");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const flagged = await prisma.order.updateMany({
      where: {
        spaceId,
        deliveryType: "store_pickup",
        pickupOverdueAt: null,
        pickupCollectedAt: null,
        pickupReleasedAt: null,
        pickupDeadlineAt: { not: null, lt: new Date() },
      },
      data: { pickupOverdueAt: new Date() },
    });

    return actionSuccess({ flagged: flagged.count }, "Overdue pickups flagged");
  } catch (error) {
    console.error("Error flagging overdue pickups:", error);
    return actionError("Failed to flag overdue pickups");
  }
}
