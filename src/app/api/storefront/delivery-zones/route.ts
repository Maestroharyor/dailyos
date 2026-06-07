import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * GET /api/storefront/delivery-zones
 * Active merchant-configured shipping locations + fees. The storefront
 * renders these as the checkout shipping selector; the fee is re-validated
 * server-side at order creation.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const zones = await prisma.deliveryZone.findMany({
      where: { spaceId: ctx.spaceId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, fee: true },
    });

    return storefrontSuccess(
      {
        zones: zones.map((z) => ({
          id: z.id,
          name: z.name,
          fee: Number(z.fee),
        })),
      },
      "Delivery zones retrieved successfully",
      request
    );
  } catch (error) {
    console.error("Storefront delivery zones error:", error);
    return storefrontError("Failed to fetch delivery zones", 500, request);
  }
}
