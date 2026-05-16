"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
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
