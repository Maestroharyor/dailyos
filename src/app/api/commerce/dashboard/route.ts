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

    // Execute all queries in parallel
    const [
      orders,
      activeProductCount,
      inventoryItems,
      categories,
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
    ]);

    // Calculate revenue and profit
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
    const totalProfit = totalRevenue - totalCost;

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

    return successResponse(
      {
        stats: {
          totalRevenue,
          totalProfit,
          profitMargin: totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0,
          totalOrders: orders.length,
          activeProducts: activeProductCount,
        },
        recentOrders,
        lowStockItems,
        salesByCategory,
      },
      "Dashboard data fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return errorResponse("Failed to fetch dashboard data", 500);
  }
}
