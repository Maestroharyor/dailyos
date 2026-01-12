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
    const category = searchParams.get("category");
    const showChecked = searchParams.get("showChecked") !== "false";

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const groceries = await prisma.groceryItem.findMany({
      where: {
        spaceId,
        ...(category && category !== "all" && { category }),
        ...(!showChecked && { checked: false }),
      },
      orderBy: [{ checked: "asc" }, { category: "asc" }, { name: "asc" }],
    });

    // Group by category
    const byCategory: Record<string, typeof groceries> = {};
    groceries.forEach((item) => {
      if (!byCategory[item.category]) {
        byCategory[item.category] = [];
      }
      byCategory[item.category].push(item);
    });

    // Calculate stats
    const total = groceries.length;
    const checked = groceries.filter((g) => g.checked).length;
    const totalEstimatedCost = groceries.reduce(
      (sum, g) => sum + (g.price ? Number(g.price) * Number(g.quantity) : 0),
      0
    );

    return successResponse(
      {
        groceries,
        byCategory,
        categories: Object.keys(byCategory),
        stats: {
          total,
          checked,
          unchecked: total - checked,
          totalEstimatedCost,
        },
      },
      "Groceries fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching groceries:", error);
    return errorResponse("Failed to fetch groceries", 500);
  }
}
