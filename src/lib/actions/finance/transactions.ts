"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, transaction };
  } catch (error) {
    console.error("Error creating transaction:", error);
    return { error: "Failed to create transaction" };
  }
}

export async function updateTransaction(
  spaceId: string,
  transactionId: string,
  input: UpdateTransactionInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
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
    return { success: true, transaction };
  } catch (error) {
    console.error("Error updating transaction:", error);
    return { error: "Failed to update transaction" };
  }
}

export async function deleteTransaction(spaceId: string, transactionId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.transaction.delete({
      where: { id: transactionId, spaceId },
    });

    revalidatePath("/finance");
    revalidatePath("/finance/expenses");
    revalidatePath("/finance/income");
    return { success: true };
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return { error: "Failed to delete transaction" };
  }
}
