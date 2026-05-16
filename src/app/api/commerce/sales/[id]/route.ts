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

    const authResult = await authorizeAction(spaceId, "view_products");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const saleEvent = await prisma.saleEvent.findFirst({
      where: { id, spaceId },
      include: {
        products: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                price: true,
                salePrice: true,
                onSale: true,
                status: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true, alt: true },
                },
              },
            },
          },
          orderBy: { addedAt: "desc" },
        },
      },
    });

    if (!saleEvent) {
      return errorResponse("Sale event not found", 404);
    }

    // Compute status
    const now = new Date();
    let status: "draft" | "scheduled" | "active" | "ended";
    if (!saleEvent.isActive) {
      status = "draft";
    } else if (now < saleEvent.startDate) {
      status = "scheduled";
    } else if (now >= saleEvent.startDate && now <= saleEvent.endDate) {
      status = "active";
    } else {
      status = "ended";
    }

    // Compute effective sale prices for products
    const productsWithPrices = saleEvent.products.map((sep) => {
      const originalPrice = Number(sep.product.price);
      let effectiveSalePrice: number;

      if (sep.salePrice) {
        effectiveSalePrice = Number(sep.salePrice);
      } else if (saleEvent.discountType === "percentage") {
        effectiveSalePrice =
          Math.round(
            originalPrice * (1 - Number(saleEvent.discountValue) / 100) * 100
          ) / 100;
      } else {
        effectiveSalePrice = Math.max(
          0,
          originalPrice - Number(saleEvent.discountValue)
        );
      }

      const discountPercent =
        Math.round(((originalPrice - effectiveSalePrice) / originalPrice) * 100);

      return {
        id: sep.id,
        productId: sep.product.id,
        name: sep.product.name,
        sku: sep.product.sku,
        originalPrice,
        effectiveSalePrice,
        overrideSalePrice: sep.salePrice ? Number(sep.salePrice) : null,
        discountPercent,
        status: sep.product.status,
        image: sep.product.images[0] || null,
        addedAt: sep.addedAt,
      };
    });

    return successResponse(
      {
        saleEvent: {
          id: saleEvent.id,
          name: saleEvent.name,
          slug: saleEvent.slug,
          description: saleEvent.description,
          discountType: saleEvent.discountType,
          discountValue: Number(saleEvent.discountValue),
          bannerImage: saleEvent.bannerImage,
          startDate: saleEvent.startDate,
          endDate: saleEvent.endDate,
          isActive: saleEvent.isActive,
          status,
          createdAt: saleEvent.createdAt,
          updatedAt: saleEvent.updatedAt,
          products: productsWithPrices,
        },
      },
      "Sale event fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching sale event:", error);
    return errorResponse("Failed to fetch sale event", 500);
  }
}
