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

    const authResult = await authorizeAction(spaceId, "view_finances");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const status = searchParams.get("status"); // all, active, completed

    const goals = await prisma.goal.findMany({
      where: { spaceId },
      orderBy: { deadline: "asc" },
    });

    // Calculate progress for each goal
    const goalsWithProgress = goals.map((goal) => {
      const progress = Number(goal.targetAmount) > 0
        ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
        : 0;
      const isCompleted = progress >= 100;
      const daysRemaining = Math.ceil(
        (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      return {
        ...goal,
        progress: Math.min(progress, 100),
        isCompleted,
        daysRemaining: Math.max(daysRemaining, 0),
        isOverdue: daysRemaining < 0 && !isCompleted,
      };
    });

    // Filter by status if specified
    const filteredGoals =
      status === "active"
        ? goalsWithProgress.filter((g) => !g.isCompleted)
        : status === "completed"
        ? goalsWithProgress.filter((g) => g.isCompleted)
        : goalsWithProgress;

    // Calculate totals
    const totalTarget = goals.reduce((sum, g) => sum + Number(g.targetAmount), 0);
    const totalCurrent = goals.reduce(
      (sum, g) => sum + Number(g.currentAmount),
      0
    );

    return successResponse(
      {
        goals: filteredGoals,
        totals: {
          target: totalTarget,
          current: totalCurrent,
          remaining: totalTarget - totalCurrent,
          completedCount: goalsWithProgress.filter((g) => g.isCompleted).length,
          activeCount: goalsWithProgress.filter((g) => !g.isCompleted).length,
        },
      },
      "Goals fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching goals:", error);
    return errorResponse("Failed to fetch goals", 500);
  }
}
