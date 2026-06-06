"use server";

import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import type { OrderStatus } from "@prisma/client";
import { actionSuccess, actionError } from "@/lib/action-response";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

export async function getDashboard(spaceId: string) {
  const authResult = await authorizeAction(spaceId, "view_reports");
  if (authResult.error) {
    return actionError(authResult.error);
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

  // Use aggregation queries instead of loading all orders (Issue #6)
  const validOrderStatuses = { notIn: ["cancelled", "refunded"] as OrderStatus[] };

  const [
    // Revenue aggregation for current month (scoped to match expenses)
    revenueAgg,
    // Cost aggregation for current month
    costAgg,
    // Total order count
    totalOrderCount,
    activeProductCount,
    // Recent orders (only 5, not all)
    recentOrders,
    // Sales by category using groupBy
    salesByCategoryRaw,
    categories,
    // Low stock inventory items using aggregated stock
    inventoryItems,
    // Expense aggregations
    currentMonthExpenses,
    previousMonthExpenses,
    expensesByCategory,
    recentExpenses,
  ] = await Promise.all([
    // Revenue: sum of total for current month non-cancelled/refunded orders
    prisma.order.aggregate({
      where: {
        spaceId,
        status: validOrderStatuses,
        createdAt: { gte: firstDayCurrentMonth, lte: lastDayCurrentMonth },
      },
      _sum: { total: true },
    }),
    // Cost: sum of totalCost for current month orders
    prisma.order.aggregate({
      where: {
        spaceId,
        status: validOrderStatuses,
        createdAt: { gte: firstDayCurrentMonth, lte: lastDayCurrentMonth },
      },
      _sum: { totalCost: true },
    }),
    // Total orders
    prisma.order.count({ where: { spaceId } }),
    // Active products
    prisma.product.count({
      where: { spaceId, status: "active" },
    }),
    // Recent 5 orders
    prisma.order.findMany({
      where: { spaceId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Sales by category - current month orderItem groupBy
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          spaceId,
          status: validOrderStatuses,
          createdAt: { gte: firstDayCurrentMonth, lte: lastDayCurrentMonth },
        },
      },
      _sum: { total: true, quantity: true },
    }),
    // Categories
    prisma.category.findMany({
      where: { spaceId },
      select: { id: true, name: true },
    }),
    // Inventory items for low stock (without loading all movements)
    prisma.inventoryItem.findMany({
      where: { spaceId },
      select: {
        id: true,
        productId: true,
        variantId: true,
        product: { select: { id: true, name: true, categoryId: true } },
        variant: { select: { id: true, name: true } },
      },
    }),
    // Current month expenses
    prisma.expense.aggregate({
      where: {
        spaceId,
        date: { gte: firstDayCurrentMonth, lte: lastDayCurrentMonth },
      },
      _sum: { amount: true },
    }),
    // Previous month expenses
    prisma.expense.aggregate({
      where: {
        spaceId,
        date: { gte: firstDayPreviousMonth, lte: lastDayPreviousMonth },
      },
      _sum: { amount: true },
    }),
    // Expenses by category
    prisma.expense.groupBy({
      by: ["category"],
      where: {
        spaceId,
        date: { gte: firstDayCurrentMonth, lte: lastDayCurrentMonth },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    // Recent expenses
    prisma.expense.findMany({
      where: { spaceId },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  // Calculate revenue and profit using aggregation results (current month)
  const totalRevenue = Number(revenueAgg._sum?.total) || 0;
  const totalCost = Number(costAgg._sum?.totalCost) || 0;
  const grossProfit = totalRevenue - totalCost;

  // Expenses scoped to current month (Issue #18 fix)
  const totalExpenses = Number(currentMonthExpenses._sum.amount) || 0;
  const previousMonthExpenseTotal = Number(previousMonthExpenses._sum.amount) || 0;
  const netProfit = grossProfit - totalExpenses;

  const expenseChange = previousMonthExpenseTotal > 0
    ? Math.round(((totalExpenses - previousMonthExpenseTotal) / previousMonthExpenseTotal) * 100)
    : 0;

  // Format recent orders
  const formattedRecentOrders = recentOrders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: Number(order.total),
    itemCount: order._count.items,
    createdAt: order.createdAt.toISOString(),
  }));

  // Calculate low stock using aggregated stock (Issue #7)
  const inventoryItemIds = inventoryItems.map((i) => i.id);
  const stockMap = await getStockByInventoryItems(inventoryItemIds);

  const lowStockItems = inventoryItems
    .map((item) => {
      const currentStock = stockMap.get(item.id) || 0;
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

  // Build sales by category from orderItem groupBy
  const productCategoryMap = new Map<string, string>();
  for (const item of inventoryItems) {
    if (item.product?.categoryId) {
      productCategoryMap.set(item.productId, item.product.categoryId);
    }
  }

  const categoryAgg = new Map<string, { name: string; revenue: number; count: number }>();
  for (const sale of salesByCategoryRaw) {
    const categoryId = productCategoryMap.get(sale.productId) || "uncategorized";
    const existing = categoryAgg.get(categoryId) || {
      name: categories.find((c) => c.id === categoryId)?.name || "Uncategorized",
      revenue: 0,
      count: 0,
    };
    existing.revenue += Number(sale._sum?.total) || 0;
    existing.count += sale._sum?.quantity || 0;
    categoryAgg.set(categoryId, existing);
  }

  const salesByCategory = Array.from(categoryAgg.entries())
    .map(([id, data]) => ({
      categoryId: id,
      name: data.name,
      revenue: data.revenue,
      count: data.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Format expenses
  const formattedExpensesByCategory = expensesByCategory.map((e) => ({
    category: e.category,
    amount: Number(e._sum.amount) || 0,
  }));

  const formattedRecentExpenses = recentExpenses.map((expense) => ({
    id: expense.id,
    category: expense.category,
    amount: Number(expense.amount),
    description: expense.description,
    vendor: expense.vendor,
    date: expense.date.toISOString(),
  }));

  return actionSuccess(
    {
      stats: {
        totalRevenue,
        grossProfit,
        totalExpenses,
        netProfit,
        profitMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0,
        netProfitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0,
        expenseChange,
        totalOrders: totalOrderCount,
        activeProducts: activeProductCount,
      },
      recentOrders: formattedRecentOrders,
      lowStockItems,
      salesByCategory,
      expensesByCategory: formattedExpensesByCategory,
      recentExpenses: formattedRecentExpenses,
    },
    "Dashboard data fetched successfully"
  );
}
