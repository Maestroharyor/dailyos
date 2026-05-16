import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_inventory");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const stock = searchParams.get("stock") || "all"; // "all" | "in_stock" | "low_stock" | "out_of_stock"
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    // Get low stock threshold from settings
    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
      select: { lowStockThreshold: true },
    });
    const threshold = settings?.lowStockThreshold ?? 10;

    // Build where clause
    const where: Prisma.InventoryItemWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          {
            product: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            },
          },
          {
            variant: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      }),
    };

    // Get inventory items with stock levels
    const inventoryItems = await prisma.inventoryItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            costPrice: true,
            images: { where: { isPrimary: true }, take: 1 },
          },
        },
        variant: {
          select: { id: true, name: true, sku: true, costPrice: true },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    // Calculate stock levels using aggregation instead of loading all movements
    const inventoryItemIds = inventoryItems.map((i) => i.id);
    const stockMap = await getStockByInventoryItems(inventoryItemIds);

    const itemsWithStock = inventoryItems.map((item) => {
      const currentStock = stockMap.get(item.id) || 0;
      return {
        ...item,
        currentStock,
        isLowStock: currentStock > 0 && currentStock <= threshold,
        isOutOfStock: currentStock <= 0,
      };
    });

    // Filter by stock status
    let filteredItems = itemsWithStock;
    if (stock === "in_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock > threshold);
    } else if (stock === "low_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock > 0 && item.currentStock <= threshold);
    } else if (stock === "out_of_stock") {
      filteredItems = itemsWithStock.filter((item) => item.currentStock <= 0);
    }

    // Sort by stock level (critical items first)
    filteredItems.sort((a, b) => {
      if (a.currentStock <= 0 && b.currentStock > 0) return -1;
      if (a.currentStock > 0 && b.currentStock <= 0) return 1;
      if (a.currentStock <= threshold && b.currentStock > threshold) return -1;
      if (a.currentStock > threshold && b.currentStock <= threshold) return 1;
      return a.currentStock - b.currentStock;
    });

    // Calculate stats for all items (not filtered)
    const stats = {
      total: itemsWithStock.length,
      inStock: itemsWithStock.filter((i) => i.currentStock > threshold).length,
      lowStock: itemsWithStock.filter((i) => i.currentStock > 0 && i.currentStock <= threshold).length,
      outOfStock: itemsWithStock.filter((i) => i.currentStock <= 0).length,
    };

    // Paginate
    const total = filteredItems.length;
    const paginatedItems = filteredItems.slice((page - 1) * limit, page * limit);

    return successResponse(
      {
        inventory: paginatedItems,
        threshold,
        stats,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Inventory fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return errorResponse("Failed to fetch inventory", 500);
  }
}
