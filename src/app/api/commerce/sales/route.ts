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

    const authResult = await authorizeAction(spaceId, "view_products");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const statusFilter = searchParams.get("status");
    const { page, limit } = parsePagination(searchParams);

    const where = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [saleEvents, total] = await Promise.all([
      prisma.saleEvent.findMany({
        where,
        include: {
          _count: { select: { products: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.saleEvent.count({ where }),
    ]);

    // Add computed status for each sale event
    const now = new Date();
    const eventsWithStatus = saleEvents
      .map((event) => {
        let status: "draft" | "scheduled" | "active" | "ended";

        if (!event.isActive) {
          status = "draft";
        } else if (now < event.startDate) {
          status = "scheduled";
        } else if (now >= event.startDate && now <= event.endDate) {
          status = "active";
        } else {
          status = "ended";
        }

        return {
          ...event,
          discountValue: Number(event.discountValue),
          status,
          productCount: event._count.products,
        };
      })
      .filter((event) => !statusFilter || event.status === statusFilter);

    return successResponse(
      {
        saleEvents: eventsWithStatus,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Sale events fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching sale events:", error);
    return errorResponse("Failed to fetch sale events", 500);
  }
}
