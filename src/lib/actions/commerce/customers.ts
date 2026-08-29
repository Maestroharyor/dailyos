"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { emailChanged, emailVerification } from "@/lib/commerce/customer-verification";
import { prisma } from "@/lib/db";
import { isClientRequestIdConflict, isUniqueViolation } from "@/lib/offline/idempotency";

export interface ListCustomersFilters {
  search?: string;
  page?: number;
  limit?: number;
}

// Serialize a Prisma Customer for the React Flight boundary (Decimal ->
// number, Date -> ISO string).
function serializeCustomer(
  customer: NonNullable<Awaited<ReturnType<typeof prisma.customer.findUnique>>>
) {
  return {
    ...customer,
    storeCredit: Number(customer.storeCredit),
    birthDate: customer.birthDate ? customer.birthDate.toISOString() : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

export async function listCustomers(spaceId: string, filters: ListCustomersFilters = {}) {
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

    const ids = customers.map((customer) => customer.id);

    /**
     * Totals over the page that was just fetched, not over the table.
     *
     * The totals are a separate query because Prisma cannot aggregate a
     * relation inside `include`. Without them `customer.stats?.totalSpent` was
     * always undefined and every card in the grid printed a currency-formatted
     * zero, including customers with orders against their name.
     *
     * cancelled and refunded are excluded to match the exclusion-based revenue
     * convention used in queries/commerce/dashboard.ts and throughout reports,
     * so this figure agrees with every other total in the app.
     */
    const totals = ids.length
      ? await prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: ids }, status: { notIn: ["cancelled", "refunded"] } },
          _sum: { total: true },
        })
      : [];

    const spentByCustomer = new Map(
      totals.map((row) => [row.customerId, Number(row._sum.total ?? 0)])
    );

    const serializedCustomers = customers.map((customer) => ({
      ...serializeCustomer(customer),
      emailVerification: emailVerification(customer),
      stats: {
        totalOrders: customer._count.orders,
        totalSpent: spentByCustomer.get(customer.id) ?? 0,
      },
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
    const totalSpent = customer.orders.reduce((sum, order) => sum + Number(order.total), 0);
    const averageOrderValue = customer.orders.length > 0 ? totalSpent / customer.orders.length : 0;

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
          emailVerification: emailVerification(customer),
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
const customerFieldsSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createCustomerSchema = customerFieldsSchema.extend({
  // See Order.clientRequestId. A customer created offline is usually the first
  // half of a queued sale, so a duplicate here means the sale attaches to the
  // wrong row, or to nothing.
  clientRequestId: z.string().min(1).max(64).optional(),
});

// Derived from the fields alone: an idempotency key belongs to a create, and
// an update carrying one would silently rewrite the key of an existing row.
const updateCustomerSchema = customerFieldsSchema.partial();

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

  const clientRequestId = parsed.data.clientRequestId ?? null;

  try {
    // Idempotent replay: a queued create dispatched twice must resolve to one
    // customer, because the order queued behind it holds this customer's id.
    if (clientRequestId) {
      const existing = await prisma.customer.findUnique({
        where: { spaceId_clientRequestId: { spaceId, clientRequestId } },
      });
      if (existing) {
        return actionSuccess(serializeCustomer(existing), "Customer already recorded");
      }
    }

    const customer = await prisma.customer.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/customers");
    return actionSuccess(serializeCustomer(customer), "Customer created");
  } catch (error) {
    // A concurrent create with the same key won the race, return its row
    // rather than reporting a failure the caller cannot act on.
    if (clientRequestId && isClientRequestIdConflict(error)) {
      const existing = await prisma.customer.findUnique({
        where: { spaceId_clientRequestId: { spaceId, clientRequestId } },
      });
      if (existing) {
        return actionSuccess(serializeCustomer(existing), "Customer already recorded");
      }
    }

    console.error("Error creating customer:", error);
    if (
      isUniqueViolation(error) ||
      (error instanceof Error && error.message.includes("Unique constraint"))
    ) {
      return actionError("A customer with this email already exists");
    }
    return actionError("Failed to create customer");
  }
}

/**
 * `{ emailVerifiedAt: null }` when an update moves the address, `{}` otherwise.
 *
 * Split out so the "did it actually change" comparison is one thing rather than
 * three lines inside a try block, and so the normalisation matches every other
 * email comparison in this codebase.
 */
async function resolveEmailChange(
  customerId: string,
  spaceId: string,
  nextEmail: string | null | undefined
): Promise<{ emailVerifiedAt?: null }> {
  if (nextEmail === undefined) return {};

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, spaceId },
    select: { email: true },
  });
  if (!existing) return {};

  return emailChanged(existing.email, nextEmail) ? { emailVerifiedAt: null } : {};
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
    /**
     * Moving the address drops the verification stamp.
     *
     * The stamp says "this person proved they can read mail at this address".
     * It is a fact about the pair, so carrying it across to a new address makes
     * the row claim something nobody ever demonstrated, and a merchant editing
     * a typo would silently hand out a verified badge. That is the same
     * over-reporting this column exists to avoid, arriving through a dashboard
     * edit rather than a Supabase setting.
     *
     * Compared against the stored value rather than cleared whenever `email` is
     * present, so re-saving the form without touching the address does not
     * un-verify someone.
     */
    const emailChange = await resolveEmailChange(customerId, spaceId, parsed.data.email);

    const customer = await prisma.customer.update({
      where: { id: customerId, spaceId },
      data: { ...parsed.data, ...emailChange },
    });

    revalidatePath("/commerce/customers");
    revalidatePath(`/commerce/customers/${customerId}`);
    return actionSuccess(serializeCustomer(customer), "Customer updated");
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
