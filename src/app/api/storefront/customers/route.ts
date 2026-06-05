import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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

const createCustomerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(40).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const body = await request.json().catch(() => null);
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return storefrontError(
        parsed.error.issues[0]?.message ?? "Invalid input",
        400,
        request
      );
    }

    const { email, firstName, lastName, phone } = parsed.data;
    const name = `${firstName} ${lastName}`.trim();

    // Rely on the @@unique([spaceId, email]) constraint to resolve concurrent
    // creates atomically. Catch P2002 and translate to 409.
    try {
      const created = await prisma.customer.create({
        data: {
          spaceId: ctx.spaceId,
          name,
          email,
          phone: phone ?? null,
        },
      });

      return storefrontSuccess(
        {
          id: created.id,
          name: created.name,
          email: created.email,
          phone: created.phone,
          address: created.address,
          loyaltyPoints: created.loyaltyPoints,
          storeCredit: Number(created.storeCredit),
          createdAt: created.createdAt,
        },
        "Customer created successfully",
        request
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return storefrontError("A customer with that email already exists", 409, request);
      }
      throw err;
    }
  } catch (error) {
    console.error("Storefront customer POST error:", error);
    return storefrontError("Failed to create customer", 500, request);
  }
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
