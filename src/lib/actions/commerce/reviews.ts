"use server";

import type { Prisma, ReviewStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess } from "@/lib/action-response";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

const REVIEW_STATUSES = ["pending", "approved", "rejected", "flagged"] as const;

const listReviewsSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  productId: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
});

const updateStatusSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
});

export type ListReviewsInput = z.input<typeof listReviewsSchema>;

// DailyOS's Review model carries productId but no `product` relation (VKT's
// read-only mirror adds one). Rather than migrate the schema for a label, the
// product name is looked up separately and passed in.
type ReviewRow = Prisma.ReviewGetPayload<object>;

interface ProductLabel {
  name: string;
  slug: string | null;
}

function serializeReview(review: ReviewRow, product?: ProductLabel) {
  return {
    id: review.id,
    productId: review.productId,
    productName: product?.name ?? "Unknown product",
    productSlug: product?.slug ?? null,
    customerId: review.customerId,
    customerName: review.customerName,
    customerEmail: review.customerEmail,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    pros: review.pros,
    cons: review.cons,
    images: review.images,
    helpful: review.helpful,
    notHelpful: review.notHelpful,
    verified: review.verified,
    recommendProduct: review.recommendProduct,
    status: review.status,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

export type SerializedReview = ReturnType<typeof serializeReview>;

/**
 * Reviews for the moderation queue, newest first.
 *
 * Returns counts per status alongside the page so the UI can badge "pending"
 * without a second round trip — that badge is the whole reason a merchant
 * opens this screen.
 */
export async function listReviews(spaceId: string, input: ListReviewsInput = {}) {
  const authResult = await authorizeAction(spaceId, "view_reviews");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const parsed = listReviewsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Invalid filters");
  }
  const { status, productId, search, page, limit } = parsed.data;

  try {
    const where: Prisma.ReviewWhereInput = {
      spaceId,
      ...(status && { status }),
      ...(productId && { productId }),
      ...(search && {
        OR: [
          { customerName: { contains: search, mode: "insensitive" } },
          { comment: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [reviews, total, statusCounts] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.review.count({ where }),
      prisma.review.groupBy({
        by: ["status"],
        where: { spaceId },
        _count: { status: true },
      }),
    ]);

    const counts = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0])) as Record<
      ReviewStatus,
      number
    >;
    for (const row of statusCounts) {
      counts[row.status] = row._count.status;
    }

    // One lookup for the whole page rather than a relation load per row.
    const products = await prisma.product.findMany({
      where: { spaceId, id: { in: [...new Set(reviews.map((r) => r.productId))] } },
      select: { id: true, name: true, slug: true },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    return actionSuccess({
      reviews: reviews.map((r) => serializeReview(r, productById.get(r.productId))),
      counts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error listing reviews:", error);
    return actionError("Failed to load reviews");
  }
}

/**
 * Approves, rejects or flags a review. Approving is what makes it visible on
 * the storefront — VKT reads `status: approved` directly from the mirrored
 * table, so nothing else has to happen here for it to appear.
 */
export async function updateReviewStatus(spaceId: string, reviewId: string, status: string) {
  const authResult = await authorizeAction(spaceId, "moderate_reviews");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const parsed = updateStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return actionError("Invalid review status");
  }

  try {
    const existing = await prisma.review.findFirst({
      where: { id: reviewId, spaceId },
      select: { id: true },
    });
    if (!existing) {
      return actionError("Review not found");
    }

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: { status: parsed.data.status },
    });

    const product = await prisma.product.findUnique({
      where: { id: review.productId },
      select: { name: true, slug: true },
    });

    revalidatePath("/commerce/reviews");
    return actionSuccess(serializeReview(review, product ?? undefined), "Review updated");
  } catch (error) {
    console.error("Error updating review status:", error);
    return actionError("Failed to update review");
  }
}

/**
 * Permanently removes a review. Rejecting is the reversible option and should
 * be the default; this exists for spam and abuse.
 */
export async function deleteReview(spaceId: string, reviewId: string) {
  const authResult = await authorizeAction(spaceId, "moderate_reviews");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  try {
    const existing = await prisma.review.findFirst({
      where: { id: reviewId, spaceId },
      select: { id: true },
    });
    if (!existing) {
      return actionError("Review not found");
    }

    await prisma.review.delete({ where: { id: reviewId } });

    revalidatePath("/commerce/reviews");
    return actionSuccess(null, "Review deleted");
  } catch (error) {
    console.error("Error deleting review:", error);
    return actionError("Failed to delete review");
  }
}
