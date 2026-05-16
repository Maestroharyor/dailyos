import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_products");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const product = await prisma.product.findFirst({
      where: { id, spaceId },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: true,
        inventoryItems: {
          select: {
            id: true,
            movements: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    if (!product) {
      return errorResponse("Product not found", 404);
    }

    // Calculate total stock via DB aggregation (accurate for any number of movements)
    const inventoryItemIds = product.inventoryItems.map((i) => i.id);
    const stockMap = await getStockByInventoryItems(inventoryItemIds);
    const totalStock = Array.from(stockMap.values()).reduce((sum, s) => sum + s, 0);

    // Serialize Decimal fields
    const serializedProduct = {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      salePrice: product.salePrice ? Number(product.salePrice) : null,
      variants: product.variants.map((v) => ({
        ...v,
        price: Number(v.price),
        costPrice: Number(v.costPrice),
      })),
      totalStock,
    };

    return successResponse(
      { product: serializedProduct },
      "Product fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching product:", error);
    return errorResponse("Failed to fetch product", 500);
  }
}
