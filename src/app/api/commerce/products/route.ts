import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

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
            include: {
              movements: {
                select: { quantity: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    // Calculate total stock for each product
    const productsWithStock = products.map((product) => {
      const totalStock = product.inventoryItems.reduce((sum, item) => {
        const itemStock = item.movements.reduce((movSum, mov) => movSum + mov.quantity, 0);
        return sum + itemStock;
      }, 0);

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
