import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";
import { getStockByInventoryItems } from "@/lib/utils/inventory";

export async function OPTIONS() {
  return corsResponse();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401);
    }

    const { slug } = await params;

    // Look up by stored slug first; fall back to SKU/id for pre-backfill rows
    // and direct ID lookups from admin contexts.
    const product = await prisma.product.findFirst({
      where: {
        spaceId: ctx.spaceId,
        status: "active",
        isPublished: true,
        OR: [
          { slug: { equals: slug, mode: "insensitive" } },
          { sku: { equals: slug, mode: "insensitive" } },
          { id: slug },
        ],
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" } },
        variants: true,
        productTags: true,
        inventoryItems: {
          select: { id: true },
        },
      },
    });

    if (!product) {
      return storefrontError("Product not found", 404);
    }

    // Calculate total stock via DB aggregation (efficient for any number of movements)
    const inventoryItemIds = product.inventoryItems.map((i) => i.id);
    const stockMap = await getStockByInventoryItems(inventoryItemIds);
    const totalStock = Array.from(stockMap.values()).reduce((sum, s) => sum + s, 0);

    // Fetch approved reviews for this product
    const reviews = await prisma.review.findMany({
      where: {
        spaceId: ctx.spaceId,
        productId: product.id,
        status: "approved",
      },
      select: {
        id: true,
        customerName: true,
        customerAvatar: true,
        rating: true,
        title: true,
        comment: true,
        pros: true,
        cons: true,
        images: true,
        helpful: true,
        notHelpful: true,
        verified: true,
        recommendProduct: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return storefrontSuccess(
      {
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug ?? product.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: product.description,
        price: Number(product.price),
        salePrice: product.salePrice ? Number(product.salePrice) : null,
        onSale: product.onSale,
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
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: reviews.length,
        reviews,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      "Product fetched successfully"
    );
  } catch (error) {
    console.error("Storefront product detail error:", error);
    return storefrontError("Failed to fetch product", 500);
  }
}
