import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const search = searchParams.get("search") || "";
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!spaceId) {
      return NextResponse.json({ error: "Space ID required" }, { status: 400 });
    }

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

    return NextResponse.json({
      data: {
        discounts: discountsWithStatus,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching discounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch discounts" },
      { status: 500 }
    );
  }
}
