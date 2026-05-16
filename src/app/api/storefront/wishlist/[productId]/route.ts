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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email");
    if (!customerEmail) {
      return storefrontError("x-customer-email header is required", 400, request);
    }

    const { productId } = await params;
    const variantId = request.nextUrl.searchParams.get("variantId") || null;

    const customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      // No customer = nothing to remove, return success (idempotent)
      return storefrontSuccess({ removed: true }, "Item removed from wishlist", request);
    }

    const wishlist = await prisma.wishlist.findUnique({
      where: {
        spaceId_customerId: { spaceId: ctx.spaceId, customerId: customer.id },
      },
    });

    if (!wishlist) {
      return storefrontSuccess({ removed: true }, "Item removed from wishlist", request);
    }

    // Delete the item (ignore if not found — idempotent)
    await prisma.wishlistItem.deleteMany({
      where: {
        wishlistId: wishlist.id,
        productId,
        variantId,
      },
    });

    return storefrontSuccess(
      { removed: true },
      "Item removed from wishlist",
      request
    );
  } catch (error) {
    console.error("Storefront wishlist DELETE error:", error);
    return storefrontError("Failed to remove from wishlist", 500, request);
  }
}
