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
    const isActive = searchParams.get("isActive");
    const { page, limit } = parsePagination(searchParams);

    const where = {
      spaceId,
      ...(search && {
        OR: [
          { code: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(isActive !== null && { isActive: isActive === "true" }),
    };

    const [discounts, total] = await Promise.all([
      prisma.discount.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.discount.count({ where }),
    ]);

    // Add computed status for each discount
    const now = new Date();
    const discountsWithStatus = discounts.map((discount) => {
      let status: "active" | "scheduled" | "expired" | "disabled" | "exhausted" = "active";

      if (!discount.isActive) {
        status = "disabled";
      } else if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
        status = "exhausted";
      } else if (discount.startDate && now < discount.startDate) {
        status = "scheduled";
      } else if (discount.endDate && now > discount.endDate) {
        status = "expired";
      }

      return { ...discount, status };
    });

    return successResponse(
      {
        discounts: discountsWithStatus,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Discounts fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching discounts:", error);
    return errorResponse("Failed to fetch discounts", 500);
  }
}
