import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
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

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId");
    const onSaleFilter = searchParams.get("onSale");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "24", 10);

    // Fetch active sale events for this space
    const now = new Date();
    const activeSaleEvents = await prisma.saleEvent.findMany({
      where: {
        spaceId: ctx.spaceId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        products: { select: { productId: true, salePrice: true } },
      },
    });

    // Build a map of productId -> sale event info for quick lookup
    const saleEventMap = new Map<
      string,
      {
        salePrice: number | null;
        eventName: string;
        eventEndDate: Date;
        discountType: string;
        discountValue: number;
      }
    >();
    for (const event of activeSaleEvents) {
      for (const sep of event.products) {
        // First event wins (earliest ending)
        if (!saleEventMap.has(sep.productId)) {
          saleEventMap.set(sep.productId, {
            salePrice: sep.salePrice ? Number(sep.salePrice) : null,
            eventName: event.name,
            eventEndDate: event.endDate,
            discountType: event.discountType,
            discountValue: Number(event.discountValue),
          });
        }
      }
    }

    const where: Prisma.ProductWhereInput = {
      spaceId: ctx.spaceId,
      status: "active",
      isPublished: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(categoryId && { categoryId }),
      // If onSale filter, only include products that are manually on sale OR in active sale events
      ...(onSaleFilter === "true" && {
        OR: [
          { onSale: true },
          { id: { in: Array.from(saleEventMap.keys()) } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: "asc" } },
          variants: true,
          productTags: true,
          inventoryItems: {
            select: { id: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    // Calculate stock using aggregation instead of loading all movements
    const allInventoryItemIds = products.flatMap((p) =>
      p.inventoryItems.map((i) => i.id)
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

    const productsWithStock = products.map((product) => {
      const totalStock = product.inventoryItems.reduce(
        (sum, item) => sum + (stockMap.get(item.id) || 0),
        0
      );

      // Check if product is in an active sale event
      const eventInfo = saleEventMap.get(product.id);
      let effectiveOnSale = product.onSale;
      let effectiveSalePrice = product.salePrice
        ? Number(product.salePrice)
        : null;
      let saleEventName: string | undefined;
      let saleEventEndDate: string | undefined;

      if (eventInfo) {
        effectiveOnSale = true;
        const originalPrice = Number(product.price);

        if (eventInfo.salePrice !== null) {
          effectiveSalePrice = eventInfo.salePrice;
        } else if (eventInfo.discountType === "percentage") {
          effectiveSalePrice =
            Math.round(
              originalPrice *
                (1 - eventInfo.discountValue / 100) *
                100
            ) / 100;
        } else {
          effectiveSalePrice = Math.max(
            0,
            originalPrice - eventInfo.discountValue
          );
        }

        saleEventName = eventInfo.eventName;
        saleEventEndDate = eventInfo.eventEndDate.toISOString();
      }

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug ?? product.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: product.description,
        price: Number(product.price),
        salePrice: effectiveSalePrice,
        onSale: effectiveOnSale,
        saleEventName,
        saleEventEndDate,
        categoryId: product.categoryId,
        tags: product.tags,
        category: product.category,
        images: product.images,
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          price: Number(v.price),
          attributes: v.attributes,
        })),
        productTags: product.productTags,
        totalStock,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });

    return storefrontSuccess(
      {
        products: productsWithStock,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Products fetched successfully",
      request
    );
  } catch (error) {
    console.error("Storefront products error:", error);
    return storefrontError("Failed to fetch products", 500, request);
  }
}
