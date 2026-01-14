"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schemas
const createSupplierSchema = z.object({
  name: z.string().min(1, "Supplier name is required"),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  leadTimeDays: z.number().int().min(0).default(7),
  isActive: z.boolean().default(true),
});

const updateSupplierSchema = createSupplierSchema.partial();

const linkProductSchema = z.object({
  productId: z.string(),
  supplierSku: z.string().optional().nullable(),
  costPrice: z.number().min(0),
  minOrderQty: z.number().int().min(1).default(1),
  isPreferred: z.boolean().default(false),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type LinkProductInput = z.infer<typeof linkProductSchema>;

export async function createSupplier(spaceId: string, input: CreateSupplierInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/suppliers");
    return { success: true, supplier };
  } catch (error) {
    console.error("Error creating supplier:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A supplier with this email already exists" };
    }
    return { error: "Failed to create supplier" };
  }
}

export async function updateSupplier(
  spaceId: string,
  supplierId: string,
  input: UpdateSupplierInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    const supplier = await prisma.supplier.update({
      where: { id: supplierId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/suppliers");
    revalidatePath(`/commerce/suppliers/${supplierId}`);
    return { success: true, supplier };
  } catch (error) {
    console.error("Error updating supplier:", error);
    return { error: "Failed to update supplier" };
  }
}

export async function deleteSupplier(spaceId: string, supplierId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if supplier has purchase orders
    const hasPurchaseOrders = await prisma.purchaseOrder.findFirst({
      where: { supplierId },
    });

    if (hasPurchaseOrders) {
      return { error: "Cannot delete supplier with existing purchase orders" };
    }

    await prisma.supplier.delete({
      where: { id: supplierId, spaceId },
    });

    revalidatePath("/commerce/suppliers");
    return { success: true };
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return { error: "Failed to delete supplier" };
  }
}

export async function linkProductToSupplier(
  spaceId: string,
  supplierId: string,
  input: LinkProductInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = linkProductSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Verify supplier belongs to space
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, spaceId },
    });

    if (!supplier) {
      return { error: "Supplier not found" };
    }

    // If setting as preferred, unset other preferred suppliers for this product
    if (parsed.data.isPreferred) {
      await prisma.productSupplier.updateMany({
        where: { productId: parsed.data.productId, isPreferred: true },
        data: { isPreferred: false },
      });
    }

    const productSupplier = await prisma.productSupplier.upsert({
      where: {
        productId_supplierId: {
          productId: parsed.data.productId,
          supplierId,
        },
      },
      update: {
        supplierSku: parsed.data.supplierSku,
        costPrice: parsed.data.costPrice,
        minOrderQty: parsed.data.minOrderQty,
        isPreferred: parsed.data.isPreferred,
      },
      create: {
        productId: parsed.data.productId,
        supplierId,
        supplierSku: parsed.data.supplierSku,
        costPrice: parsed.data.costPrice,
        minOrderQty: parsed.data.minOrderQty,
        isPreferred: parsed.data.isPreferred,
      },
    });

    revalidatePath("/commerce/suppliers");
    revalidatePath(`/commerce/suppliers/${supplierId}`);
    revalidatePath(`/commerce/products/${parsed.data.productId}`);
    return { success: true, productSupplier };
  } catch (error) {
    console.error("Error linking product to supplier:", error);
    return { error: "Failed to link product to supplier" };
  }
}

export async function unlinkProductFromSupplier(
  spaceId: string,
  supplierId: string,
  productId: string
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.productSupplier.delete({
      where: {
        productId_supplierId: {
          productId,
          supplierId,
        },
      },
    });

    revalidatePath("/commerce/suppliers");
    revalidatePath(`/commerce/suppliers/${supplierId}`);
    return { success: true };
  } catch (error) {
    console.error("Error unlinking product from supplier:", error);
    return { error: "Failed to unlink product from supplier" };
  }
}
