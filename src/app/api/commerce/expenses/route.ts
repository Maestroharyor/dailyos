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

    const authResult = await authorizeAction(spaceId, "view_reports");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const category = searchParams.get("category");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const { page, limit } = parsePagination(searchParams);

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

    return successResponse(
      {
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
      "Expenses fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return errorResponse("Failed to fetch expenses", 500);
  }
}
