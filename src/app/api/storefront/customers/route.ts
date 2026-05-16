import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email");
    if (!customerEmail) {
      return storefrontError("Customer email is required", 400, request);
    }

    const customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      return storefrontError("Customer not found", 404, request);
    }

    return storefrontSuccess(
      {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        loyaltyPoints: customer.loyaltyPoints,
        storeCredit: Number(customer.storeCredit),
        createdAt: customer.createdAt,
      },
      "Customer retrieved successfully",
      request
    );
  } catch (error) {
    console.error("Storefront customer GET error:", error);
    return storefrontError("Failed to fetch customer", 500, request);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email");
    if (!customerEmail) {
      return storefrontError("Customer email is required", 400, request);
    }

    const customer = await prisma.customer.findFirst({
      where: { spaceId: ctx.spaceId, email: customerEmail },
    });

    if (!customer) {
      return storefrontError("Customer not found", 404, request);
    }

    const body = await request.json();

    const updateData: { name?: string; phone?: string | null; address?: string | null } = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.address !== undefined) updateData.address = body.address;

    if (Object.keys(updateData).length === 0) {
      return storefrontError("No updatable fields provided", 400, request);
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: updateData,
    });

    return storefrontSuccess(
      {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        loyaltyPoints: updated.loyaltyPoints,
        storeCredit: Number(updated.storeCredit),
        createdAt: updated.createdAt,
      },
      "Customer updated successfully",
      request
    );
  } catch (error) {
    console.error("Storefront customer PUT error:", error);
    return storefrontError("Failed to update customer", 500, request);
  }
}
