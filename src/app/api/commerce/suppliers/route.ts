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

    return NextResponse.json({
      data: {
        suppliers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}
