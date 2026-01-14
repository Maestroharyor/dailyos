"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import type { DiscountType } from "@prisma/client";

// Validation schemas
const createDiscountSchema = z.object({
  code: z.string().min(3).max(20).optional(), // Optional - will auto-generate if not provided
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  type: z.enum(["percentage", "fixed_amount"]),
  value: z.number().positive("Value must be greater than 0"),
  minOrderAmount: z.number().min(0).optional().nullable(),
  maxDiscount: z.number().min(0).optional().nullable(), // Cap for percentage discounts
  usageLimit: z.number().int().min(1).optional().nullable(), // Total uses allowed
  perCustomerLimit: z.number().int().min(1).optional().nullable(), // Uses per customer
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  appliesTo: z.array(z.string()).default([]), // Product or Category IDs, empty = all
});

const updateDiscountSchema = createDiscountSchema.partial().extend({
  code: z.string().min(3).max(20).optional(),
});

export type CreateDiscountInput = z.infer<typeof createDiscountSchema>;
export type UpdateDiscountInput = z.infer<typeof updateDiscountSchema>;

// Generate a unique discount code
function generateDiscountCode(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like O, 0, I, 1
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate multiple unique codes at once
export async function generateDiscountCodes(
  spaceId: string,
  count: number,
  prefix: string = ""
): Promise<string[]> {
  const codes: string[] = [];
  const existingCodes = new Set(
    (await prisma.discount.findMany({ where: { spaceId }, select: { code: true } })).map(
      (d) => d.code
    )
  );

  let attempts = 0;
  while (codes.length < count && attempts < count * 10) {
    const code = prefix + generateDiscountCode(prefix ? 6 : 8);
    if (!existingCodes.has(code) && !codes.includes(code)) {
      codes.push(code);
    }
    attempts++;
  }

  return codes;
}

export async function createDiscount(spaceId: string, input: CreateDiscountInput) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = createDiscountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Generate code if not provided
    let code = parsed.data.code;
    if (!code) {
      const existingCodes = new Set(
        (await prisma.discount.findMany({ where: { spaceId }, select: { code: true } })).map(
          (d) => d.code
        )
      );
      let attempts = 0;
      while (!code || existingCodes.has(code)) {
        code = generateDiscountCode();
        attempts++;
        if (attempts > 100) {
          return { error: "Failed to generate unique code" };
        }
      }
    }

    // Validate percentage discounts
    if (parsed.data.type === "percentage" && parsed.data.value > 100) {
      return { error: "Percentage discount cannot exceed 100%" };
    }

    const discount = await prisma.discount.create({
      data: {
        spaceId,
        code: code.toUpperCase(),
        name: parsed.data.name,
        description: parsed.data.description,
        type: parsed.data.type as DiscountType,
        value: parsed.data.value,
        minOrderAmount: parsed.data.minOrderAmount,
        maxDiscount: parsed.data.maxDiscount,
        usageLimit: parsed.data.usageLimit,
        perCustomerLimit: parsed.data.perCustomerLimit,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        isActive: parsed.data.isActive,
        appliesTo: parsed.data.appliesTo,
      },
    });

    revalidatePath("/commerce/discounts");
    return { success: true, discount };
  } catch (error) {
    console.error("Error creating discount:", error);
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A discount with this code already exists" };
    }
    return { error: "Failed to create discount" };
  }
}

export async function createBulkDiscounts(
  spaceId: string,
  count: number,
  templateInput: Omit<CreateDiscountInput, "code">,
  prefix: string = ""
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  if (count < 1 || count > 100) {
    return { error: "Count must be between 1 and 100" };
  }

  try {
    const codes = await generateDiscountCodes(spaceId, count, prefix);

    if (codes.length < count) {
      return { error: "Could not generate enough unique codes" };
    }

    const discounts = await prisma.discount.createMany({
      data: codes.map((code, index) => ({
        spaceId,
        code,
        name: `${templateInput.name} #${index + 1}`,
        description: templateInput.description,
        type: (templateInput.type || "percentage") as DiscountType,
        value: templateInput.value,
        minOrderAmount: templateInput.minOrderAmount,
        maxDiscount: templateInput.maxDiscount,
        usageLimit: templateInput.usageLimit || 1, // Default single use for bulk
        perCustomerLimit: templateInput.perCustomerLimit || 1,
        startDate: templateInput.startDate ? new Date(templateInput.startDate) : null,
        endDate: templateInput.endDate ? new Date(templateInput.endDate) : null,
        isActive: templateInput.isActive ?? true,
        appliesTo: templateInput.appliesTo || [],
      })),
    });

    revalidatePath("/commerce/discounts");
    return { success: true, count: discounts.count, codes };
  } catch (error) {
    console.error("Error creating bulk discounts:", error);
    return { error: "Failed to create bulk discounts" };
  }
}

export async function updateDiscount(
  spaceId: string,
  discountId: string,
  input: UpdateDiscountInput
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  const parsed = updateDiscountSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  try {
    // Validate percentage discounts
    if (parsed.data.type === "percentage" && parsed.data.value && parsed.data.value > 100) {
      return { error: "Percentage discount cannot exceed 100%" };
    }

    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.code) {
      updateData.code = parsed.data.code.toUpperCase();
    }
    if (parsed.data.startDate) {
      updateData.startDate = new Date(parsed.data.startDate);
    }
    if (parsed.data.endDate) {
      updateData.endDate = new Date(parsed.data.endDate);
    }

    const discount = await prisma.discount.update({
      where: { id: discountId, spaceId },
      data: updateData,
    });

    revalidatePath("/commerce/discounts");
    revalidatePath(`/commerce/discounts/${discountId}`);
    return { success: true, discount };
  } catch (error) {
    console.error("Error updating discount:", error);
    return { error: "Failed to update discount" };
  }
}

export async function toggleDiscountActive(
  spaceId: string,
  discountId: string,
  isActive: boolean
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    const discount = await prisma.discount.update({
      where: { id: discountId, spaceId },
      data: { isActive },
    });

    revalidatePath("/commerce/discounts");
    return { success: true, discount };
  } catch (error) {
    console.error("Error toggling discount:", error);
    return { error: "Failed to toggle discount" };
  }
}

export async function deleteDiscount(spaceId: string, discountId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if discount has been used
    const discount = await prisma.discount.findUnique({
      where: { id: discountId, spaceId },
    });

    if (!discount) {
      return { error: "Discount not found" };
    }

    if (discount.usageCount > 0) {
      // Soft delete - just deactivate
      await prisma.discount.update({
        where: { id: discountId },
        data: { isActive: false },
      });
      return { success: true, message: "Discount deactivated (has usage history)" };
    }

    await prisma.discount.delete({
      where: { id: discountId, spaceId },
    });

    revalidatePath("/commerce/discounts");
    return { success: true };
  } catch (error) {
    console.error("Error deleting discount:", error);
    return { error: "Failed to delete discount" };
  }
}

// Validate and apply discount code
export async function validateDiscountCode(
  spaceId: string,
  code: string,
  orderTotal: number,
  customerId?: string,
  productIds?: string[]
) {
  try {
    const discount = await prisma.discount.findUnique({
      where: { spaceId_code: { spaceId, code: code.toUpperCase() } },
    });

    if (!discount) {
      return { valid: false, error: "Invalid discount code" };
    }

    // Check if active
    if (!discount.isActive) {
      return { valid: false, error: "This discount code is no longer active" };
    }

    // Check date validity
    const now = new Date();
    if (discount.startDate && now < discount.startDate) {
      return { valid: false, error: "This discount code is not yet active" };
    }
    if (discount.endDate && now > discount.endDate) {
      return { valid: false, error: "This discount code has expired" };
    }

    // Check usage limit
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
      return { valid: false, error: "This discount code has reached its usage limit" };
    }

    // Check per-customer limit
    if (discount.perCustomerLimit && customerId) {
      const customerUsage = await prisma.order.count({
        where: { spaceId, customerId, discountCode: code.toUpperCase() },
      });
      if (customerUsage >= discount.perCustomerLimit) {
        return { valid: false, error: "You have already used this discount code" };
      }
    }

    // Check minimum order amount
    if (discount.minOrderAmount && orderTotal < Number(discount.minOrderAmount)) {
      return {
        valid: false,
        error: `Minimum order amount of $${Number(discount.minOrderAmount).toFixed(2)} required`,
      };
    }

    // Check if applies to specific products/categories
    const appliesTo = discount.appliesTo as string[];
    if (appliesTo.length > 0 && productIds && productIds.length > 0) {
      const hasEligibleProduct = productIds.some((pid) => appliesTo.includes(pid));
      if (!hasEligibleProduct) {
        return { valid: false, error: "This discount does not apply to items in your cart" };
      }
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discount.type === "percentage") {
      discountAmount = (orderTotal * Number(discount.value)) / 100;
      // Apply max discount cap if set
      if (discount.maxDiscount && discountAmount > Number(discount.maxDiscount)) {
        discountAmount = Number(discount.maxDiscount);
      }
    } else {
      discountAmount = Number(discount.value);
    }

    // Don't exceed order total
    if (discountAmount > orderTotal) {
      discountAmount = orderTotal;
    }

    return {
      valid: true,
      discount: {
        id: discount.id,
        code: discount.code,
        name: discount.name,
        type: discount.type,
        value: Number(discount.value),
        discountAmount: Math.round(discountAmount * 100) / 100,
      },
    };
  } catch (error) {
    console.error("Error validating discount:", error);
    return { valid: false, error: "Failed to validate discount code" };
  }
}

// Increment discount usage count (call after successful order)
export async function incrementDiscountUsage(spaceId: string, code: string) {
  try {
    await prisma.discount.update({
      where: { spaceId_code: { spaceId, code: code.toUpperCase() } },
      data: { usageCount: { increment: 1 } },
    });
    return { success: true };
  } catch (error) {
    console.error("Error incrementing discount usage:", error);
    return { error: "Failed to update discount usage" };
  }
}
