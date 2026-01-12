import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const month = searchParams.get("month"); // YYYY-MM format
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    // Build date range for month filter
    let dateFilter: Prisma.TransactionWhereInput = {};
    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);
      dateFilter = {
        date: {
          gte: startDate,
          lte: endDate,
        },
      };
    }

    // Build where clause
    const where: Prisma.TransactionWhereInput = {
      spaceId,
      ...dateFilter,
      ...(type && type !== "all" && { type: type as Prisma.EnumTransactionTypeFilter }),
      ...(category && category !== "all" && { category }),
    };

    // Execute queries in parallel
    const [transactions, total, stats] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({
        by: ["type"],
        where: { spaceId, ...dateFilter },
        _sum: { amount: true },
      }),
    ]);

    // Calculate totals
    const income = stats.find((s) => s.type === "income")?._sum.amount ?? 0;
    const expense = stats.find((s) => s.type === "expense")?._sum.amount ?? 0;

    return successResponse(
      {
        transactions,
        stats: {
          income: Number(income),
          expense: Number(expense),
          balance: Number(income) - Number(expense),
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Transactions fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return errorResponse("Failed to fetch transactions", 500);
  }
}
