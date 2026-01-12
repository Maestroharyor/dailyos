import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const product = await prisma.product.findFirst({
      where: { id, spaceId },
      include: {
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        variants: true,
        inventoryItems: {
          include: {
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

    // Calculate total stock
    const totalStock = product.inventoryItems.reduce((sum, item) => {
      const itemStock = item.movements.reduce((s, m) => s + m.quantity, 0);
      return sum + itemStock;
    }, 0);

    return successResponse(
      {
        product: {
          ...product,
          totalStock,
        },
      },
      "Product fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching product:", error);
    return errorResponse("Failed to fetch product", 500);
  }
}
