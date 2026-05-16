import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_recipes");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const category = searchParams.get("category");
    const source = searchParams.get("source");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "12", 10);

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
