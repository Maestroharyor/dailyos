"use server";

import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { materializeRecurring } from "./recurring";

/**
 * Dashboard aggregation for a single month: income/expense/balance totals,
 * expense breakdown by category (for the pie chart), and the most recent
 * transactions. Budgets and goals are read separately via their own hooks.
 */
export async function getFinanceOverview(spaceId: string, month?: string) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_finances");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    // Keep recurring instances current so the dashboard reflects them too.
    await materializeRecurring(spaceId);

    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const [year, monthNum] = targetMonth.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);
    const where = { spaceId, date: { gte: startDate, lte: endDate } };

    const [byType, expenseByCategory, recent] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["type"],
        where,
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["category"],
        where: { ...where, type: "expense" },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        take: 5,
      }),
    ]);

    const income = Number(byType.find((t) => t.type === "income")?._sum.amount ?? 0);
    const expense = Number(byType.find((t) => t.type === "expense")?._sum.amount ?? 0);

    return actionSuccess(
      {
        month: targetMonth,
        stats: { income, expense, balance: income - expense },
        expensesByCategory: expenseByCategory.map((c) => ({
          name: c.category,
          value: Number(c._sum.amount ?? 0),
        })),
        recentTransactions: recent.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          category: t.category,
          description: t.description,
          date: t.date.toISOString(),
        })),
      },
      "Finance overview fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching finance overview:", error);
    return actionError("Failed to fetch finance overview");
  }
}
