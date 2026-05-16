import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const categories = await prisma.category.findMany({
      where: { spaceId: ctx.spaceId },
      include: {
        children: {
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: {
            products: {
              where: { status: "active", isPublished: true },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    // Build tree structure (top-level categories with nested children)
    const topLevel = categories.filter((c) => !c.parentId);
    const tree = topLevel.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      sortOrder: cat.sortOrder,
      productCount: cat._count.products,
      children: cat.children.map((child) => {
        const full = categories.find((c) => c.id === child.id);
        return {
          id: child.id,
          name: child.name,
          slug: child.slug,
          description: child.description,
          sortOrder: child.sortOrder,
          productCount: full?._count.products ?? 0,
        };
      }),
    }));

    return storefrontSuccess(
      { categories: tree },
      "Categories fetched successfully",
      request
    );
  } catch (error) {
    console.error("Storefront categories error:", error);
    return storefrontError("Failed to fetch categories", 500, request);
  }
}
