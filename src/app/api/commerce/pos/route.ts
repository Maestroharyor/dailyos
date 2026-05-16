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

    const authResult = await authorizeAction(spaceId, "create_pos_sale");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    // POS search/filter parameters
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Build product filter
    const productWhere: Prisma.ProductWhereInput = {
      spaceId,
      status: "active",
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(categoryId && categoryId !== "all" && { categoryId }),
    };

    // Fetch all data needed for POS in parallel
    const [products, totalProducts, categories, customers, settings] = await Promise.all([
      // Active products with pagination
      prisma.product.findMany({
        where: productWhere,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: true,
          variants: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              costPrice: true,
            },
          },
          inventoryItems: {
            select: { id: true, variantId: true },
          },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where: productWhere }),
      // Categories
      prisma.category.findMany({
        where: { spaceId },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
      // Customers
      prisma.customer.findMany({
        where: { spaceId },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: "asc" },
      }),
      // Commerce settings
      prisma.commerceSettings.findUnique({
        where: { spaceId },
      }),
    ]);

    // Calculate stock using aggregation instead of loading all movements
    const allInventoryItemIds = products.flatMap((p) =>
      p.inventoryItems.map((i) => i.id)
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

    // Transform products to include stock calculations
    const productsWithStock = products.map((product) => {
      const stockByVariant: Record<string, number> = {};
      let totalStock = 0;

      for (const invItem of product.inventoryItems) {
        const stock = stockMap.get(invItem.id) || 0;
        const key = invItem.variantId || "base";
        stockByVariant[key] = (stockByVariant[key] || 0) + stock;
        totalStock += stock;
      }

      return {
        id: product.id,
        spaceId: product.spaceId,
        sku: product.sku,
        name: product.name,
        description: product.description,
        price: Number(product.price),
        costPrice: Number(product.costPrice),
        status: product.status,
        isPublished: product.isPublished,
        categoryId: product.categoryId,
        category: product.category,
        images: product.images.map((img) => ({
          id: img.id,
          url: img.url,
          alt: img.alt,
          isPrimary: img.isPrimary,
        })),
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: Number(v.price),
          costPrice: Number(v.costPrice),
          stock: stockByVariant[v.id] || 0,
        })),
        stock: stockByVariant["base"] || 0,
        totalStock,
      };
    });

    // Default settings if not configured
    const defaultSettings = {
      id: "",
      spaceId,
      currency: "USD",
      taxRate: 0,
      lowStockThreshold: 10,
      storeName: "My Store",
      storeAddress: "",
      storePhone: "",
      paymentMethods: [
        { id: "cash", name: "Cash", isActive: true },
        { id: "card", name: "Card", isActive: true },
        { id: "transfer", name: "Bank Transfer", isActive: true },
        { id: "pos", name: "POS Terminal", isActive: true },
      ],
      updatedAt: new Date().toISOString(),
    };

    return successResponse(
      {
        products: productsWithStock,
        categories,
        customers,
        settings: settings
          ? {
              ...settings,
              taxRate: Number(settings.taxRate),
              paymentMethods: settings.paymentMethods || defaultSettings.paymentMethods,
            }
          : defaultSettings,
        pagination: {
          total: totalProducts,
          page,
          limit,
          totalPages: Math.ceil(totalProducts / limit),
        },
      },
      "POS data fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching POS data:", error);
    return errorResponse("Failed to fetch POS data", 500);
  }
}
