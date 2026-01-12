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

    // Get or create settings
    let settings = await prisma.commerceSettings.findUnique({
      where: { spaceId },
    });

    if (!settings) {
      settings = await prisma.commerceSettings.create({
        data: {
          spaceId,
          currency: "USD",
          taxRate: 0,
          lowStockThreshold: 10,
          storeName: "",
          storeAddress: "",
          storePhone: "",
          paymentMethods: [
            { id: "cash", name: "Cash", isActive: true },
            { id: "card", name: "Card", isActive: true },
            { id: "transfer", name: "Bank Transfer", isActive: true },
          ],
        },
      });
    }

    return successResponse({ settings }, "Settings fetched successfully");
  } catch (error) {
    console.error("Error fetching commerce settings:", error);
    return errorResponse("Failed to fetch settings", 500);
  }
}
