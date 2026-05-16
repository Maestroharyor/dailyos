"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().min(1),
  date: z.string(), // ISO date string
  tags: z.array(z.string()).default([]),
  recurring: z.boolean().default(false),
  recurrenceType: z.enum(["weekly", "monthly", "yearly"]).optional().nullable(),
});

const updateTransactionSchema = createTransactionSchema.partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export async function createTransaction(
  spaceId: string,
  input: CreateTransactionInput
) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const transaction = await prisma.transaction.create({
      data: {
        spaceId,
        ...parsed.data,
        date: new Date(parsed.data.date),
      },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(transaction, "Transaction created");
  } catch (error) {
    console.error("Error creating transaction:", error);
    return actionError("Failed to create transaction");
  }
}

export async function updateTransaction(
  spaceId: string,
  transactionId: string,
  input: UpdateTransactionInput
) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const updateData = {
      ...parsed.data,
      ...(parsed.data.date && { date: new Date(parsed.data.date) }),
    };

    const transaction = await prisma.transaction.update({
      where: { id: transactionId, spaceId },
      data: updateData,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(transaction, "Transaction updated");
  } catch (error) {
    console.error("Error updating transaction:", error);
    return actionError("Failed to update transaction");
  }
}

export async function deleteTransaction(spaceId: string, transactionId: string) {
  const authResult = await authorizeAction(spaceId, "edit_finances");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    await prisma.transaction.delete({
      where: { id: transactionId, spaceId },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return actionSuccess(null, "Transaction deleted");
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return actionError("Failed to delete transaction");
  }
}
