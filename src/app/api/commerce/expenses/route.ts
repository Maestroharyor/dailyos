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
    const category = searchParams.get("category");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!spaceId) {
      return NextResponse.json({ error: "Space ID required" }, { status: 400 });
    }

    const where = {
      spaceId,
      ...(category && { category: category as never }),
      ...(startDate && endDate && {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      }),
    };

    const [expenses, total, summary] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    // Get category breakdown
    const byCategory = await prisma.expense.groupBy({
      by: ["category"],
      where,
      _sum: { amount: true },
      _count: true,
    });

    return NextResponse.json({
      data: {
        expenses,
        totalAmount: Number(summary._sum.amount) || 0,
        byCategory: byCategory.map((c) => ({
          category: c.category,
          amount: Number(c._sum.amount) || 0,
          count: c._count,
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
    console.error("Error fetching expenses:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}
