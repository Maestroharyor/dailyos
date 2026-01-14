import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");

    if (!spaceId) {
      return NextResponse.json({ error: "Space ID required" }, { status: 400 });
    }

    // Get discount with usage history
    const discount = await prisma.discount.findUnique({
      where: { id, spaceId },
      include: {
        usages: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!discount) {
      return NextResponse.json({ error: "Discount not found" }, { status: 404 });
    }

    // Get orders that used this discount code
    const ordersWithDiscount = await prisma.order.findMany({
      where: {
        spaceId,
        discountCode: discount.code,
      },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        discount: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50, // Limit to last 50 orders
    });

    // Compute status
    const now = new Date();
    let status: "active" | "scheduled" | "expired" | "disabled" | "exhausted" = "active";

    if (!discount.isActive) {
      status = "disabled";
    } else if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      status = "exhausted";
    } else if (discount.startDate && now < discount.startDate) {
      status = "scheduled";
    } else if (discount.endDate && now > discount.endDate) {
      status = "expired";
    }

    // Serialize decimal values
    const serializedDiscount = {
      ...discount,
      value: Number(discount.value),
      minOrderAmount: discount.minOrderAmount ? Number(discount.minOrderAmount) : null,
      maxDiscount: discount.maxDiscount ? Number(discount.maxDiscount) : null,
      status,
    };

    const serializedOrders = ordersWithDiscount.map((order) => ({
      ...order,
      total: Number(order.total),
      discount: Number(order.discount),
    }));

    return NextResponse.json({
      data: {
        discount: serializedDiscount,
        orders: serializedOrders,
      },
    });
  } catch (error) {
    console.error("Error fetching discount details:", error);
    return NextResponse.json(
      { error: "Failed to fetch discount details" },
      { status: 500 }
    );
  }
}
