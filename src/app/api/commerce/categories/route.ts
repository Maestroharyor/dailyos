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

    const categories = await prisma.category.findMany({
      where: { spaceId },
      include: {
        _count: {
          select: { products: true },
        },
        children: {
          include: {
            _count: { select: { products: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Build tree structure
    const rootCategories = categories.filter((c) => !c.parentId);
    const categoryTree = rootCategories.map((category) => ({
      ...category,
      children: categories.filter((c) => c.parentId === category.id),
    }));

    return successResponse(
      {
        categories: categoryTree,
        flatCategories: categories,
      },
      "Categories fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    return errorResponse("Failed to fetch categories", 500);
  }
}
