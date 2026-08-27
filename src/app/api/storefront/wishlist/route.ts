import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
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

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    if (!customerEmail) {
      return storefrontSuccess([], "No customer email provided", request);
    }

    const customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      return storefrontSuccess([], "Wishlist items", request);
    }

    // Fetch wishlist items with product data, filtering out inactive/unpublished products at the DB level
    const wishlistItems = await prisma.wishlistItem.findMany({
      where: {
        wishlist: {
          spaceId: ctx.spaceId,
          customerId: customer.id,
        },
        product: { status: "active", isPublished: true },
      },
      include: {
        product: {
          include: {
            images: { orderBy: { sortOrder: "asc" } },
            inventoryItems: { select: { id: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    if (wishlistItems.length === 0) {
      return storefrontSuccess([], "Wishlist items", request);
    }

    // Calculate stock for all products in one query
    const allInventoryItemIds = wishlistItems.flatMap((item) =>
      item.product.inventoryItems.map((i) => i.id)
    );
    const stockMap = await getStockByInventoryItems(allInventoryItemIds);

    const items = wishlistItems.map((item) => {
      const totalStock = item.product.inventoryItems.reduce(
        (sum, inv) => sum + (stockMap.get(inv.id) || 0),
        0
      );

      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        addedAt: item.addedAt.toISOString(),
        product: {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.sku.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          price: Number(item.product.price),
          salePrice: item.product.salePrice ? Number(item.product.salePrice) : null,
          onSale: item.product.onSale,
          images: item.product.images.map((img) => ({
            url: img.url,
            alt: img.alt,
            isPrimary: img.isPrimary,
          })),
          totalStock,
        },
      };
    });

    return storefrontSuccess(items, "Wishlist items", request);
  } catch (error) {
    console.error("Storefront wishlist GET error:", error);
    return storefrontError("Failed to fetch wishlist", 500, request);
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    if (!customerEmail) {
      return storefrontError("x-customer-email header is required", 400, request);
    }

    const body: unknown = await request.json();
    const { productId, variantId } = (body ?? {}) as {
      productId?: unknown;
      variantId?: unknown;
    };

    if (typeof productId !== "string" || !productId) {
      return storefrontError("productId is required", 400, request);
    }
    if (variantId !== undefined && variantId !== null && typeof variantId !== "string") {
      return storefrontError("variantId is invalid", 400, request);
    }

    // Verify product exists and is active
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        spaceId: ctx.spaceId,
        status: "active",
        isPublished: true,
      },
    });

    if (!product) {
      return storefrontError("Product not found", 404, request);
    }

    // Find or create customer
    let customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          spaceId: ctx.spaceId,
          name: customerEmail.split("@")[0],
          email: customerEmail,
        },
      });
    }

    // Upsert wishlist
    const wishlist = await prisma.wishlist.upsert({
      where: {
        spaceId_customerId: { spaceId: ctx.spaceId, customerId: customer.id },
      },
      create: { spaceId: ctx.spaceId, customerId: customer.id },
      update: {},
    });

    // Add the item, idempotently.
    //
    // findFirst-then-create rather than `upsert`, because `variantId` is
    // nullable and Prisma types a compound-unique `where` as non-nullable. The
    // `where` above read `variantId: variantId || null`, and `null` there is a
    // runtime validation error, not a lookup: it threw, the catch turned it
    // into a 500, and adding any product without a variant to a wishlist failed
    // every time. `request.json()` returns `any`, so nothing flagged it at
    // build time.
    //
    // The unique index cannot dedupe these rows either, since Postgres treats
    // NULLs as distinct, so the explicit check below is doing the real work.
    const target = { wishlistId: wishlist.id, productId, variantId: variantId ?? null };
    const existing = await prisma.wishlistItem.findFirst({ where: target, select: { id: true } });
    if (!existing) {
      await prisma.wishlistItem.create({ data: target });
    }

    return storefrontSuccess({ added: true }, "Item added to wishlist", request);
  } catch (error) {
    console.error("Storefront wishlist POST error:", error);
    return storefrontError("Failed to add to wishlist", 500, request);
  }
}
