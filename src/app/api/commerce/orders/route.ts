import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_orders");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const customerId = searchParams.get("customerId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Build where clause
    const where: Prisma.OrderWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { customer: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
      ...(status && status !== "all" && { status: status as Prisma.EnumOrderStatusFilter }),
      ...(source && source !== "all" && { source: source as Prisma.EnumOrderSourceFilter }),
      ...(customerId && { customerId }),
    };

    // Execute queries in parallel
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: true,
          items: {
            include: {
              product: {
                select: { name: true, images: { where: { isPrimary: true }, take: 1 } },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return successResponse(
      {
        orders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Orders fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    return errorResponse("Failed to fetch orders", 500);
  }
}
