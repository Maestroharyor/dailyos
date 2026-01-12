import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category");
    const source = searchParams.get("source");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    // Build where clause
    const where: Prisma.RecipeWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { ingredients: { hasSome: [search] } },
        ],
      }),
      ...(category && category !== "all" && { category: category as Prisma.EnumRecipeCategoryFilter }),
      ...(source && source !== "all" && { source: source as Prisma.EnumRecipeSourceFilter }),
    };

    // Execute queries in parallel
    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recipe.count({ where }),
    ]);

    return successResponse(
      {
        recipes,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Recipes fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching recipes:", error);
    return errorResponse("Failed to fetch recipes", 500);
  }
}
