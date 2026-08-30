import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildDeliveryCatalog } from "@/lib/delivery/catalog";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * GET /api/storefront/delivery-zones
 *
 * The whole delivery catalog: every active option grouped by the state it is
 * offered in, the copy shown under each, and the synthesised store pickup rows.
 * The storefront renders these as the checkout shipping selector; the fee and
 * any deposit are re-validated server-side at order creation, so nothing here
 * is trusted back.
 *
 * `zones` is the original flat shape, kept for any consumer still reading it.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const catalog = await buildDeliveryCatalog(prisma, ctx.spaceId);

    return storefrontSuccess(
      {
        ...catalog,
        // Legacy flat shape. Store pickup is excluded from it deliberately: a
        // consumer reading `zones` predates the deposit concept and would show
        // a refundable hold as if it were a shipping fee.
        zones: catalog.options
          .filter((o) => o.deliveryType !== "store_pickup")
          .map((o) => ({ id: o.id, name: o.label, fee: o.fee })),
      },
      "Delivery zones retrieved successfully",
      request
    );
  } catch (error) {
    console.error("Storefront delivery zones error:", error);
    return storefrontError("Failed to fetch delivery zones", 500, request);
  }
}
