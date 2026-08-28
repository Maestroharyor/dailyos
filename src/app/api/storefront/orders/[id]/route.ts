import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";
import { orderInstructions } from "@/lib/utils/order-notes";
import { serializeStorefrontOrder } from "@/lib/utils/storefront-order";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * GET /api/storefront/orders/[id]
 *
 * One order, for the customer who placed it. Scoped by both the storefront key
 * (which space) and x-customer-email (whose order), so knowing an order id is
 * not enough to read it.
 *
 * Answers 404 rather than 403 when the order belongs to someone else: telling a
 * caller "that exists but isn't yours" turns order ids into an enumeration
 * oracle.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    if (!customerEmail) {
      return storefrontError("Customer email is required", 400, request);
    }

    const { id } = await params;

    const order = await prisma.order.findFirst({
      where: {
        id,
        spaceId: ctx.spaceId,
        customer: { email: customerEmail },
      },
      include: {
        items: {
          include: {
            product: { select: { slug: true, images: true } },
          },
        },
        customer: true,
        deliveryZone: { select: { id: true, name: true, fee: true } },
        statusHistory: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!order) {
      return storefrontError("Order not found", 404, request);
    }

    const serialized = serializeStorefrontOrder(order);

    return storefrontSuccess(
      {
        ...serialized,
        updatedAt: order.updatedAt,
        paymentMethod: order.paymentMethod,
        loyaltyPointsEarned: order.loyaltyPointsEarned,
        // The shopper's own directions, never the metadata blob older orders
        // carry appended to this column. Stripped at the API boundary rather
        // than in the storefront: internal metadata has no business crossing
        // it, and doing it here fixes every consumer at once.
        notes: orderInstructions(order.notes),
        deliveryZone: order.deliveryZone
          ? {
              id: order.deliveryZone.id,
              name: order.deliveryZone.name,
              fee: Number(order.deliveryZone.fee),
            }
          : null,
        // Only the slug is added here. `image` is resolved by the shared
        // serializer, which this route used to override with the whole
        // ProductImage row instead of its url, so every line rendered its alt
        // text next to its title.
        items: serialized.items.map((item, index) => ({
          ...item,
          slug: order.items[index]?.product?.slug ?? null,
        })),
        // Real timestamps per transition, so the storefront tracker can say
        // when a step happened instead of inferring the whole journey from
        // whichever status the order happens to sit at now.
        statusHistory: order.statusHistory.map((entry) => ({
          status: entry.status,
          createdAt: entry.createdAt,
        })),
      },
      "Order retrieved",
      request
    );
  } catch (error) {
    console.error("Storefront order detail error:", error);
    return storefrontError("Failed to fetch order", 500, request);
  }
}
