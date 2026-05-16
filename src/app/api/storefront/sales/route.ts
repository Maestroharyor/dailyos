import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const now = new Date();

    const saleEvents = await prisma.saleEvent.findMany({
      where: {
        spaceId: ctx.spaceId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        products: {
          include: {
            product: {
              include: {
                category: { select: { id: true, name: true, slug: true } },
                images: { orderBy: { sortOrder: "asc" } },
                variants: true,
                productTags: true,
                inventoryItems: { select: { id: true } },
              },
            },
          },
        },
      },
      orderBy: { endDate: "asc" },
    });

    // Gather all inventory item IDs for stock calculation
    const allInventoryItemIds = saleEvents.flatMap((event) =>
      event.products.flatMap((sep) =>
        sep.product.inventoryItems.map((i) => i.id)
      )
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

    const sales = saleEvents.map((event) => {
      const products = event.products
        .filter(
          (sep) =>
            sep.product.status === "active" && sep.product.isPublished
        )
        .map((sep) => {
          const originalPrice = Number(sep.product.price);
          let effectiveSalePrice: number;

          if (sep.salePrice) {
            effectiveSalePrice = Number(sep.salePrice);
          } else if (event.discountType === "percentage") {
            effectiveSalePrice =
              Math.round(
                originalPrice *
                  (1 - Number(event.discountValue) / 100) *
                  100
              ) / 100;
          } else {
            effectiveSalePrice = Math.max(
              0,
              originalPrice - Number(event.discountValue)
            );
          }

          const discountPercent = Math.round(
            ((originalPrice - effectiveSalePrice) / originalPrice) * 100
          );

          const totalStock = sep.product.inventoryItems.reduce(
            (sum, item) => sum + (stockMap.get(item.id) || 0),
            0
          );

          return {
            id: sep.product.id,
            sku: sep.product.sku,
            name: sep.product.name,
            slug: sep.product.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            description: sep.product.description,
            price: originalPrice,
            salePrice: effectiveSalePrice,
            onSale: true,
            effectiveSalePrice,
            discountPercent,
            categoryId: sep.product.categoryId,
            tags: sep.product.tags,
            category: sep.product.category,
            images: sep.product.images,
            variants: sep.product.variants.map((v) => ({
              id: v.id,
              sku: v.sku,
              name: v.name,
              price: Number(v.price),
              attributes: v.attributes,
            })),
            productTags: sep.product.productTags,
            totalStock,
          };
        });

      return {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        bannerImage: event.bannerImage,
        startDate: event.startDate,
        endDate: event.endDate,
        discountType: event.discountType,
        discountValue: Number(event.discountValue),
        products,
      };
    });

    return storefrontSuccess(
      { sales },
      "Active sales fetched successfully",
      request
    );
  } catch (error) {
    console.error("Storefront sales error:", error);
    return storefrontError("Failed to fetch sales", 500, request);
  }
}
