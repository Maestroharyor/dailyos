import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_meals");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Default to current week if no dates specified
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const start = startDate ? new Date(startDate) : weekStart;
    const end = endDate ? new Date(endDate) : weekEnd;

    const meals = await prisma.meal.findMany({
      where: {
        spaceId,
        date: {
          gte: start,
          lte: end,
        },
      },
      include: {
        recipe: {
          select: {
            id: true,
            name: true,
            image: true,
            cookTime: true,
            category: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { type: "asc" }],
    });

    // Group meals by date
    const mealsByDate: Record<string, typeof meals> = {};
    meals.forEach((meal) => {
      const dateKey = new Date(meal.date).toISOString().split("T")[0];
      if (!mealsByDate[dateKey]) {
        mealsByDate[dateKey] = [];
      }
      mealsByDate[dateKey].push(meal);
    });

    return successResponse(
      {
        meals,
        mealsByDate,
        dateRange: {
          start: start.toISOString().split("T")[0],
          end: end.toISOString().split("T")[0],
        },
      },
      "Meals fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching meals:", error);
    return errorResponse("Failed to fetch meals", 500);
  }
}
