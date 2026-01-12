import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
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

    // Calculate profit
    const profit =
      Number(order.total) -
      Number(order.totalCost) -
      Number(order.discount);

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
