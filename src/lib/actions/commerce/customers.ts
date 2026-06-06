"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export interface ListCustomersFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export async function listCustomers(
  spaceId: string,
  filters: ListCustomersFilters = {}
) {
  const authResult = await authorizeAction(spaceId, "view_customers");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;

    // Build where clause
    const where: Prisma.CustomerWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    // Execute queries in parallel
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          _count: {
            select: { orders: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    const serializedCustomers = customers.map((customer) => ({
      ...customer,
      storeCredit: Number(customer.storeCredit),
      birthDate: customer.birthDate ? customer.birthDate.toISOString() : null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    }));

    return actionSuccess(
      {
        customers: serializedCustomers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Customers fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching customers:", error);
    return actionError("Failed to fetch customers");
  }
}

export async function getCustomer(spaceId: string, customerId: string) {
  const authResult = await authorizeAction(spaceId, "view_customers");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, spaceId },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!customer) {
      return actionError("Customer not found");
    }

    // Calculate stats
    const totalSpent = customer.orders.reduce(
      (sum, order) => sum + Number(order.total),
      0
    );
    const averageOrderValue =
      customer.orders.length > 0 ? totalSpent / customer.orders.length : 0;

    return actionSuccess(
      {
        customer: {
          ...customer,
          storeCredit: Number(customer.storeCredit),
          birthDate: customer.birthDate ? customer.birthDate.toISOString() : null,
          createdAt: customer.createdAt.toISOString(),
          updatedAt: customer.updatedAt.toISOString(),
          orders: customer.orders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            total: Number(order.total),
            status: order.status,
            createdAt: order.createdAt.toISOString(),
          })),
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
    return actionError("Failed to fetch customer");
  }
}

// Validation schemas
const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateCustomerSchema = createCustomerSchema.partial();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export async function createCustomer(spaceId: string, input: CreateCustomerInput) {
  const authResult = await authorizeAction(spaceId, "edit_customers");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/customers");
    return actionSuccess(customer, "Customer created");
  } catch (error) {
    console.error("Error creating customer:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("A customer with this email already exists");
    }
    return actionError("Failed to create customer");
  }
}

export async function updateCustomer(
  spaceId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  const authResult = await authorizeAction(spaceId, "edit_customers");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const customer = await prisma.customer.update({
      where: { id: customerId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/customers");
    revalidatePath(`/commerce/customers/${customerId}`);
    return actionSuccess(customer, "Customer updated");
  } catch (error) {
    console.error("Error updating customer:", error);
    return actionError("Failed to update customer");
  }
}

export async function deleteCustomer(spaceId: string, customerId: string) {
  const authResult = await authorizeAction(spaceId, "edit_customers");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Check if customer has orders
    const hasOrders = await prisma.order.findFirst({
      where: { customerId },
    });

    if (hasOrders) {
      return actionError("Cannot delete customer with existing orders");
    }

    await prisma.customer.delete({
      where: { id: customerId, spaceId },
    });

    revalidatePath("/commerce/customers");
    return actionSuccess(null, "Customer deleted");
  } catch (error) {
    console.error("Error deleting customer:", error);
    return actionError("Failed to delete customer");
  }
}
