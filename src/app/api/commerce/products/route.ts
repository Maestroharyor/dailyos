import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

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

    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    // Build where clause
    const where: Prisma.ProductWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(categoryId && categoryId !== "all" && { categoryId }),
      ...(status && status !== "all" && { status: status as Prisma.EnumProductStatusFilter }),
    };

    // Execute queries in parallel
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          images: {
            orderBy: { sortOrder: "asc" },
          },
          variants: true,
          inventoryItems: {
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    // Calculate stock using aggregation instead of loading all movements
    const allInventoryItemIds = products.flatMap((p) =>
      p.inventoryItems.map((i) => i.id)
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

    const productsWithStock = products.map((product) => {
      const totalStock = product.inventoryItems.reduce(
        (sum, item) => sum + (stockMap.get(item.id) || 0),
        0
      );

      // Serialize Decimal fields and add totalStock
      return {
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
        inventoryItems: undefined, // Remove from response to keep it clean
      };
    });

    return successResponse(
      {
        products: productsWithStock,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Products fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return errorResponse("Failed to fetch products", 500);
  }
}
