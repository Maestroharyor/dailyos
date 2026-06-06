"use server";

import { revalidatePath } from "next/cache";
import { authorizeAction } from "@/lib/api-auth";
import { actionSuccess, actionError } from "@/lib/action-response";
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

// Serialize a Prisma Supplier for the React Flight boundary (Date -> ISO
// string), matching the shape listSuppliers returns.
function serializeSupplier(
  supplier: NonNullable<Awaited<ReturnType<typeof prisma.supplier.findUnique>>>
) {
  return {
    ...supplier,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

export type SupplierFilters = {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

export async function listSuppliers(spaceId: string, filters: SupplierFilters = {}) {
  const authResult = await authorizeAction(spaceId, "view_inventory");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    const search = filters.search || "";
    const isActive = filters.isActive;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const where = {
      spaceId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { contactName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(isActive !== undefined && { isActive }),
    };

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: { select: { products: true, purchaseOrders: true } },
        },
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    const serializedSuppliers = suppliers.map(serializeSupplier);

    return actionSuccess(
      {
        suppliers: serializedSuppliers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Suppliers fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return actionError("Failed to fetch suppliers");
  }
}

export async function createSupplier(spaceId: string, input: CreateSupplierInput) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        spaceId,
        ...parsed.data,
      },
    });

    revalidatePath("/commerce/suppliers");
    return actionSuccess(serializeSupplier(supplier), "Supplier created");
  } catch (error) {
    console.error("Error creating supplier:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return actionError("A supplier with this email already exists");
    }
    return actionError("Failed to create supplier");
  }
}

export async function updateSupplier(
  spaceId: string,
  supplierId: string,
  input: UpdateSupplierInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    const supplier = await prisma.supplier.update({
      where: { id: supplierId, spaceId },
      data: parsed.data,
    });

    revalidatePath("/commerce/suppliers");
    revalidatePath(`/commerce/suppliers/${supplierId}`);
    return actionSuccess(serializeSupplier(supplier), "Supplier updated");
  } catch (error) {
    console.error("Error updating supplier:", error);
    return actionError("Failed to update supplier");
  }
}

export async function deleteSupplier(spaceId: string, supplierId: string) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  try {
    // Check if supplier has purchase orders
    const hasPurchaseOrders = await prisma.purchaseOrder.findFirst({
      where: { supplierId },
    });

    if (hasPurchaseOrders) {
      return actionError("Cannot delete supplier with existing purchase orders");
    }

    await prisma.supplier.delete({
      where: { id: supplierId, spaceId },
    });

    revalidatePath("/commerce/suppliers");
    return actionSuccess(null, "Supplier deleted");
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return actionError("Failed to delete supplier");
  }
}

export async function linkProductToSupplier(
  spaceId: string,
  supplierId: string,
  input: LinkProductInput
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
  }

  const parsed = linkProductSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid input");
  }

  try {
    // Verify supplier belongs to space
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, spaceId },
    });

    if (!supplier) {
      return actionError("Supplier not found");
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
    return actionSuccess(
      { ...productSupplier, costPrice: Number(productSupplier.costPrice) },
      "Product linked to supplier"
    );
  } catch (error) {
    console.error("Error linking product to supplier:", error);
    return actionError("Failed to link product to supplier");
  }
}

export async function unlinkProductFromSupplier(
  spaceId: string,
  supplierId: string,
  productId: string
) {
  const authResult = await authorizeAction(spaceId, "edit_products");
  if ("error" in authResult) {
    return actionError(authResult.error);
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
    return actionSuccess(null, "Product unlinked from supplier");
  } catch (error) {
    console.error("Error unlinking product from supplier:", error);
    return actionError("Failed to unlink product from supplier");
  }
}
