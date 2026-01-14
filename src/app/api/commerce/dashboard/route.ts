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

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    // Get commerce settings for low stock threshold
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
    });
    const lowStockThreshold = settings?.lowStockThreshold ?? 10;

    // Calculate date ranges for current and previous month
    const now = new Date();
    const firstDayCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const firstDayPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Execute all queries in parallel
    const [
      orders,
      activeProductCount,
      inventoryItems,
      categories,
      currentMonthExpenses,
      previousMonthExpenses,
      expensesByCategory,
      recentExpenses,
    ] = await Promise.all([
      // Get all orders for revenue/profit calculations
      prisma.order.findMany({
        where: { spaceId },
        include: {
          items: {
            include: {
              product: {
                select: { categoryId: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Count active products
      prisma.product.count({
        where: { spaceId, status: "active" },
      }),
      // Get inventory items with stock calculations
      prisma.inventoryItem.findMany({
        where: { spaceId },
        include: {
          product: {
            select: { id: true, name: true },
          },
          variant: {
            select: { id: true, name: true },
          },
          movements: {
            select: { quantity: true },
          },
        },
      }),
      // Get categories
      prisma.category.findMany({
        where: { spaceId },
        select: { id: true, name: true },
      }),
      // Get current month expenses total
      prisma.expense.aggregate({
        where: {
          spaceId,
          date: {
            gte: firstDayCurrentMonth,
            lte: lastDayCurrentMonth,
          },
        },
        _sum: { amount: true },
      }),
      // Get previous month expenses total
      prisma.expense.aggregate({
        where: {
          spaceId,
          date: {
            gte: firstDayPreviousMonth,
            lte: lastDayPreviousMonth,
          },
        },
        _sum: { amount: true },
      }),
      // Get expenses by category for current month
      prisma.expense.groupBy({
        by: ["category"],
        where: {
          spaceId,
          date: {
            gte: firstDayCurrentMonth,
            lte: lastDayCurrentMonth,
          },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      // Get recent expenses
      prisma.expense.findMany({
        where: { spaceId },
        orderBy: { date: "desc" },
        take: 5,
      }),
    ]);

    // Calculate revenue and gross profit
    const completedOrders = orders.filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded"
    );
    const totalRevenue = completedOrders.reduce(
      (sum, o) => sum + Number(o.total),
      0
    );
    const totalCost = completedOrders.reduce(
      (sum, o) => sum + o.items.reduce(
        (itemSum, item) => itemSum + (Number(item.unitCost) * item.quantity),
        0
      ),
      0
    );
    const grossProfit = totalRevenue - totalCost;

    // Calculate total expenses and net profit
    const totalExpenses = Number(currentMonthExpenses._sum.amount) || 0;
    const previousMonthExpenseTotal = Number(previousMonthExpenses._sum.amount) || 0;
    const netProfit = grossProfit - totalExpenses;

    // Calculate expense change percentage
    const expenseChange = previousMonthExpenseTotal > 0
      ? Math.round(((totalExpenses - previousMonthExpenseTotal) / previousMonthExpenseTotal) * 100)
      : 0;

    // Get recent orders (last 5)
    const recentOrders = orders.slice(0, 5).map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: Number(order.total),
      itemCount: order.items.length,
      createdAt: order.createdAt.toISOString(),
    }));

    // Calculate low stock items
    const lowStockItems = inventoryItems
      .map((item) => {
        const currentStock = item.movements.reduce(
          (sum, m) => sum + m.quantity,
          0
        );
        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.product?.name || "Unknown",
          variantName: item.variant?.name,
          stock: currentStock,
        };
      })
      .filter((item) => item.stock <= lowStockThreshold && item.stock > 0)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5);

    // Calculate sales by category
    const categoryMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const order of completedOrders) {
      for (const item of order.items) {
        const categoryId = item.product?.categoryId || "uncategorized";
        const existing = categoryMap.get(categoryId) || {
          name: categories.find((c) => c.id === categoryId)?.name || "Uncategorized",
          revenue: 0,
          count: 0,
        };
        existing.revenue += Number(item.unitPrice) * item.quantity;
        existing.count += item.quantity;
        categoryMap.set(categoryId, existing);
      }
    }

    const salesByCategory = Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        categoryId: id,
        name: data.name,
        revenue: data.revenue,
        count: data.count,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Format expenses by category
    const formattedExpensesByCategory = expensesByCategory.map((e) => ({
      category: e.category,
      amount: Number(e._sum.amount) || 0,
    }));

    // Format recent expenses
    const formattedRecentExpenses = recentExpenses.map((expense) => ({
      id: expense.id,
      category: expense.category,
      amount: Number(expense.amount),
      description: expense.description,
      vendor: expense.vendor,
      date: expense.date.toISOString(),
    }));

    return successResponse(
      {
        stats: {
          totalRevenue,
          grossProfit,
          totalExpenses,
          netProfit,
          profitMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0,
          netProfitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0,
          expenseChange,
          totalOrders: orders.length,
          activeProducts: activeProductCount,
        },
        recentOrders,
        lowStockItems,
        salesByCategory,
        expensesByCategory: formattedExpensesByCategory,
        recentExpenses: formattedRecentExpenses,
      },
      "Dashboard data fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return errorResponse("Failed to fetch dashboard data", 500);
  }
}
