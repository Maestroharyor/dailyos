"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const adjustPointsSchema = z.object({
  customerId: z.string(),
  points: z.number().int(),
  type: z.enum(["earned", "redeemed", "expired", "adjusted"]),
  description: z.string().optional(),
  orderId: z.string().optional().nullable(),
});

export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;

export async function adjustLoyaltyPoints(spaceId: string, input: AdjustPointsInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = adjustPointsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Verify customer exists
    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId, spaceId },
    });

    if (!customer) {
      return { error: "Customer not found" };
    }

    // For redemptions, check if customer has enough points
    if (parsed.data.type === "redeemed" && parsed.data.points > 0) {
      // Points should be negative for redemption, but check absolute value
      const pointsToRedeem = Math.abs(parsed.data.points);
      if (customer.loyaltyPoints < pointsToRedeem) {
        return { error: "Customer does not have enough points" };
      }
    }

    // Create transaction record
    await prisma.loyaltyTransaction.create({
      data: {
        spaceId,
        customerId: parsed.data.customerId,
        orderId: parsed.data.orderId,
        points: parsed.data.points,
        type: parsed.data.type,
        description: parsed.data.description,
      },
    });

    // Update customer's loyalty points
    await prisma.customer.update({
      where: { id: parsed.data.customerId },
      data: {
        loyaltyPoints: { increment: parsed.data.points },
      },
    });

    revalidatePath("/commerce/customers");
    revalidatePath(`/commerce/customers/${parsed.data.customerId}`);
    return { success: true };
  } catch (error) {
    console.error("Error adjusting loyalty points:", error);
    return { error: "Failed to adjust loyalty points" };
  }
}

export async function getCustomerLoyaltyHistory(spaceId: string, customerId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { spaceId, customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, spaceId },
      select: { loyaltyPoints: true, storeCredit: true },
    });

    return {
      success: true,
      transactions,
      currentPoints: customer?.loyaltyPoints || 0,
      storeCredit: Number(customer?.storeCredit) || 0,
    };
  } catch (error) {
    console.error("Error getting loyalty history:", error);
    return { error: "Failed to get loyalty history" };
  }
}

// Calculate points to award for an order
export async function calculatePointsForOrder(spaceId: string, orderTotal: number) {
  try {
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
    });

    if (!settings?.loyaltyEnabled) {
      return { points: 0, enabled: false };
    }

    const points = Math.floor(orderTotal * settings.loyaltyPointsPerDollar);
    return { points, enabled: true };
  } catch (error) {
    console.error("Error calculating points:", error);
    return { points: 0, enabled: false };
  }
}

// Calculate point value (for redemption)
export async function calculatePointValue(spaceId: string, points: number) {
  try {
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
    });

    if (!settings?.loyaltyEnabled) {
      return { value: 0, enabled: false };
    }

    const value = points * Number(settings.loyaltyPointValue);
    return { value: Math.round(value * 100) / 100, enabled: true };
  } catch (error) {
    console.error("Error calculating point value:", error);
    return { value: 0, enabled: false };
  }
}

// Redeem points at checkout
export async function redeemPoints(
  spaceId: string,
  customerId: string,
  points: number,
  orderId?: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, spaceId },
    });

    if (!customer) {
      return { error: "Customer not found" };
    }

    if (customer.loyaltyPoints < points) {
      return { error: "Insufficient points" };
    }

    const { value, enabled } = await calculatePointValue(spaceId, points);

    if (!enabled) {
      return { error: "Loyalty program is not enabled" };
    }

    // Create redemption transaction
    await prisma.loyaltyTransaction.create({
      data: {
        spaceId,
        customerId,
        orderId,
        points: -points,
        type: "redeemed",
        description: `Redeemed ${points} points for $${value.toFixed(2)} discount`,
      },
    });

    // Update customer points
    await prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { decrement: points } },
    });

    revalidatePath("/commerce/customers");
    return { success: true, value };
  } catch (error) {
    console.error("Error redeeming points:", error);
    return { error: "Failed to redeem points" };
  }
}

// Use store credit at checkout
export async function useStoreCredit(
  spaceId: string,
  customerId: string,
  amount: number
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, spaceId },
    });

    if (!customer) {
      return { error: "Customer not found" };
    }

    if (Number(customer.storeCredit) < amount) {
      return { error: "Insufficient store credit" };
    }

    // Update customer store credit
    await prisma.customer.update({
      where: { id: customerId },
      data: { storeCredit: { decrement: amount } },
    });

    revalidatePath("/commerce/customers");
    return { success: true };
  } catch (error) {
    console.error("Error using store credit:", error);
    return { error: "Failed to use store credit" };
  }
}
