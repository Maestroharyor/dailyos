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

    // Fetch all data needed for POS in parallel
    const [products, categories, customers, settings] = await Promise.all([
      // Active products with inventory data
      prisma.product.findMany({
        where: { spaceId, status: "active" },
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
            include: {
              movements: {
                select: { quantity: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
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

    // Transform products to include stock calculations
    const productsWithStock = products.map((product) => {
      // Calculate stock for each variant or the product itself
      const stockByVariant: Record<string, number> = {};
      let totalStock = 0;

      for (const invItem of product.inventoryItems) {
        const stock = invItem.movements.reduce((sum, m) => sum + m.quantity, 0);
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
      },
      "POS data fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching POS data:", error);
    return errorResponse("Failed to fetch POS data", 500);
  }
}
