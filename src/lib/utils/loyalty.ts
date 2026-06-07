import { prisma } from "@/lib/db";

// Interactive-transaction client of the project's (extended) Prisma client —
// matches the tx helpers used across the commerce actions
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Awards loyalty points for an order inside the caller's transaction.
 * Creates the "earned" LoyaltyTransaction and increments the customer's
 * balance atomically with the order. Returns the points earned (0 when
 * loyalty is disabled or the order doesn't qualify) so the caller can
 * persist it on Order.loyaltyPointsEarned.
 */
export async function earnLoyaltyForOrder(
  tx: Tx,
  params: {
    spaceId: string;
    customerId: string;
    orderId: string;
    orderNumber: string;
    orderTotal: number;
  }
): Promise<number> {
  const settings = await tx.commerceSettings.findUnique({
    where: { spaceId: params.spaceId },
    select: { loyaltyEnabled: true, loyaltyPointsPerDollar: true },
  });

  if (!settings?.loyaltyEnabled) return 0;

  const points = Math.floor(params.orderTotal * settings.loyaltyPointsPerDollar);
  if (points <= 0) return 0;

  await tx.loyaltyTransaction.create({
    data: {
      spaceId: params.spaceId,
      customerId: params.customerId,
      orderId: params.orderId,
      points,
      type: "earned",
      description: `Earned on order ${params.orderNumber}`,
    },
  });

  await tx.customer.update({
    where: { id: params.customerId },
    data: { loyaltyPoints: { increment: points } },
  });

  return points;
}

/**
 * Reverses the points earned on an order (cancellation/refund) inside the
 * caller's transaction. No-op when the order earned nothing or has no
 * customer. Callers must guard against double-reversal by checking the
 * order's previous status.
 */
export async function reverseLoyaltyForOrder(
  tx: Tx,
  order: {
    id: string;
    spaceId: string;
    customerId: string | null;
    orderNumber: string;
    loyaltyPointsEarned: number;
  }
): Promise<void> {
  if (!order.customerId || order.loyaltyPointsEarned <= 0) return;

  await tx.loyaltyTransaction.create({
    data: {
      spaceId: order.spaceId,
      customerId: order.customerId,
      orderId: order.id,
      points: -order.loyaltyPointsEarned,
      type: "adjusted",
      description: `Reversal for order ${order.orderNumber}`,
    },
  });

  await tx.customer.update({
    where: { id: order.customerId },
    data: { loyaltyPoints: { decrement: order.loyaltyPointsEarned } },
  });
}
