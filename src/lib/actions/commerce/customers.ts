"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const customer = await prisma.customer.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/customers");
    return { success: true, customer };
  } catch (error) {
    console.error("Error creating customer:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A customer with this email already exists" };
    }
    return { error: "Failed to create customer" };
  }
}

export async function updateCustomer(
  spaceId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const customer = await prisma.customer.update({
      where: { id: customerId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/customers");
    revalidatePath(`/commerce/customers/${customerId}`);
    return { success: true, customer };
  } catch (error) {
    console.error("Error updating customer:", error);
    return { error: "Failed to update customer" };
  }
}

export async function deleteCustomer(spaceId: string, customerId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if customer has orders
    const hasOrders = await prisma.order.findFirst({
      where: { customerId },
    });

    if (hasOrders) {
      return { error: "Cannot delete customer with existing orders" };
    }

    await prisma.customer.delete({
      where: { id: customerId, spaceId },
    });

    revalidatePath("/commerce/customers");
    return { success: true };
  } catch (error) {
    console.error("Error deleting customer:", error);
    return { error: "Failed to delete customer" };
  }
}
