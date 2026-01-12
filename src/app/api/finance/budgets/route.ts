import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const month = searchParams.get("month"); // YYYY-MM format

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    // Default to current month if not specified
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    // Get budgets for the month
    const budgets = await prisma.budget.findMany({
      where: { spaceId, month: targetMonth },
      orderBy: { category: "asc" },
    });

    // Get actual spending for each category
    const [year, monthNum] = targetMonth.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const spending = await prisma.transaction.groupBy({
      by: ["category"],
      where: {
        spaceId,
        type: "expense",
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    // Merge budgets with actual spending
    const budgetsWithSpending = budgets.map((budget) => {
      const spent = spending.find((s) => s.category === budget.category)?._sum
        .amount ?? 0;
      return {
        ...budget,
        spent: Number(spent),
        remaining: Number(budget.amount) - Number(spent),
        percentUsed: Number(budget.amount) > 0
          ? (Number(spent) / Number(budget.amount)) * 100
          : 0,
      };
    });

    // Calculate totals
    const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
    const totalSpent = budgetsWithSpending.reduce((sum, b) => sum + b.spent, 0);

    return successResponse(
      {
        budgets: budgetsWithSpending,
        month: targetMonth,
        totals: {
          budget: totalBudget,
          spent: totalSpent,
          remaining: totalBudget - totalSpent,
        },
      },
      "Budgets fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return errorResponse("Failed to fetch budgets", 500);
  }
}
