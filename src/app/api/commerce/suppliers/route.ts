import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { parsePagination } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_inventory");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const isActive = searchParams.get("isActive");
    const { page, limit } = parsePagination(searchParams);

    const where = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { contactName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(isActive !== null && { isActive: isActive === "true" }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: { select: { products: true, purchaseOrders: true } },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    return successResponse(
      {
        suppliers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Suppliers fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return errorResponse("Failed to fetch suppliers", 500);
  }
}
