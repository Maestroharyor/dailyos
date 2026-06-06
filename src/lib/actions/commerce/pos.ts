"use server";

import { Prisma } from "@prisma/client";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import {
  DEFAULT_PAYMENT_METHODS,
  type DefaultPaymentMethod,
} from "@/lib/commerce-defaults";

export interface POSProductFilters {
  search?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
}

// Paged, server-filtered product grid data. Consumed by the POS infinite
// query — keep this lean so loading the next page doesn't refetch the
// customers/settings context.
export async function getPOSProducts(
  spaceId: string,
  filters: POSProductFilters = {}
) {
  try {
    if (!spaceId) {
      return actionError("spaceId is required");
    }

    const authResult = await authorizeAction(spaceId, "create_pos_sale");
    if (authResult.error) {
      return actionError(authResult.error);
    }

    const search = filters.search || "";
    const categoryId = filters.categoryId ?? null;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 48));

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

    const [products, totalProducts] = await Promise.all([
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

    return actionSuccess(
      {
        products: productsWithStock,
        pagination: {
          total: totalProducts,
          page,
          limit,
          totalPages: Math.ceil(totalProducts / limit),
        },
      },
      "POS products fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching POS products:", error);
    return actionError("Failed to fetch POS products");
  }
}

// Static POS context: categories, customers, and commerce settings. Fetched
// once per space; the product grid pages independently via getPOSProducts.
export async function getPOSContext(spaceId: string) {
  try {
    if (!spaceId) {
      return actionError("spaceId is required");
    }

    const authResult = await authorizeAction(spaceId, "create_pos_sale");
    if (authResult.error) {
      return actionError(authResult.error);
    }

    const [categories, customers, settings] = await Promise.all([
      prisma.category.findMany({
        where: { spaceId },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      }),
      prisma.customer.findMany({
        where: { spaceId },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: "asc" },
      }),
      prisma.commerceSettings.findUnique({
        where: { spaceId },
      }),
    ]);

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
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      updatedAt: new Date().toISOString(),
    };

    // The stored JSON column defaults to [] (e.g. rows created by onboarding
    // before methods were configured) — `[] || fallback` would keep the empty
    // array, so check length explicitly. Cast at the JSON boundary only.
    const storedPaymentMethods = settings?.paymentMethods as
      | DefaultPaymentMethod[]
      | null
      | undefined;
    const paymentMethods =
      Array.isArray(storedPaymentMethods) && storedPaymentMethods.length > 0
        ? storedPaymentMethods
        : DEFAULT_PAYMENT_METHODS;

    return actionSuccess(
      {
        categories,
        customers,
        settings: settings
          ? {
              ...settings,
              taxRate: Number(settings.taxRate),
              loyaltyPointValue: Number(settings.loyaltyPointValue),
              paymentMethods,
              updatedAt: settings.updatedAt.toISOString(),
            }
          : defaultSettings,
      },
      "POS context fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching POS context:", error);
    return actionError("Failed to fetch POS context");
  }
}
