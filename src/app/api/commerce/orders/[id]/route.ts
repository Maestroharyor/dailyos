import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_orders");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const order = await prisma.order.findFirst({
      where: { id, spaceId },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: { where: { isPrimary: true }, take: 1 },
              },
            },
            variant: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!order) {
      return errorResponse("Order not found", 404);
    }

    // Calculate profit: revenue (total minus tax) minus cost
    const profit = Number(order.total) - Number(order.tax) - Number(order.totalCost);

    return successResponse(
      {
        order: {
          ...order,
          profit,
        },
      },
      "Order fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching order:", error);
    return errorResponse("Failed to fetch order", 500);
  }
}
