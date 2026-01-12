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

    const customer = await prisma.customer.findFirst({
      where: { id, spaceId },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            items: true,
          },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!customer) {
      return errorResponse("Customer not found", 404);
    }

    // Calculate stats
    const totalSpent = customer.orders.reduce(
      (sum, order) => sum + Number(order.total),
      0
    );
    const averageOrderValue =
      customer.orders.length > 0 ? totalSpent / customer.orders.length : 0;

    return successResponse(
      {
        customer: {
          ...customer,
          stats: {
            totalOrders: customer._count.orders,
            totalSpent,
            averageOrderValue,
          },
        },
      },
      "Customer fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching customer:", error);
    return errorResponse("Failed to fetch customer", 500);
  }
}
