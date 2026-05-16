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

    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    const search = searchParams.get("search") || "";
    const { page, limit } = parsePagination(searchParams);

    const where = {
      spaceId,
      ...(status && { status: status as never }),
      ...(supplierId && { supplierId }),
      ...(search && {
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" as const } },
          { supplier: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };

    const [purchaseOrders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    // Get stats
    const stats = await prisma.purchaseOrder.groupBy({
      by: ["status"],
      where: { spaceId },
      _count: true,
      _sum: { total: true },
    });

    return successResponse(
      {
        purchaseOrders,
        stats: stats.map((s) => ({
          status: s.status,
          count: s._count,
          total: Number(s._sum.total) || 0,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Purchase orders fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return errorResponse("Failed to fetch purchase orders", 500);
  }
}
