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
    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!spaceId) {
      return NextResponse.json({ error: "Space ID required" }, { status: 400 });
    }

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

    return NextResponse.json({
      data: {
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
    });
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase orders" },
      { status: 500 }
    );
  }
}
