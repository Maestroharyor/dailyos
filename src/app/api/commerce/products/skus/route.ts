import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_products");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    // Get all product SKUs
    const products = await prisma.product.findMany({
      where: { spaceId },
      select: { sku: true },
    });

    // Get all variant SKUs
    const variants = await prisma.productVariant.findMany({
      where: { product: { spaceId } },
      select: { sku: true },
    });

    // Combine and uppercase all SKUs
    const skus = [
      ...products.map((p) => p.sku.toUpperCase()),
      ...variants.map((v) => v.sku.toUpperCase()),
    ];

    return successResponse({ skus }, "SKUs fetched successfully");
  } catch (error) {
    console.error("Error fetching SKUs:", error);
    return errorResponse("Failed to fetch SKUs", 500);
  }
}
