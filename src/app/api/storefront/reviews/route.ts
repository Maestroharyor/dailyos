import type { NextRequest } from "next/server";
import { FULFILLED_ORDER_STATUSES } from "@/lib/commerce/order-status";
import { prisma } from "@/lib/db";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";

const MAX_COMMENT = 4000;
const MAX_LIST_ENTRIES = 5;
const MAX_LIST_ENTRY_LENGTH = 200;

function cleanList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, MAX_LIST_ENTRY_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_LIST_ENTRIES);
}

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * POST /api/storefront/reviews
 *
 * Submits a product review. Created as `pending` — nothing reaches the
 * storefront until a merchant approves it in /commerce/reviews. The storefront
 * has to tell the customer that, or an approved-later review reads as a broken
 * form.
 *
 * There is no GET here on purpose: VKT mirrors the Review table in its own
 * read-only schema and reads approved reviews directly, the same way it reads
 * the catalog.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(`reviews:${storefrontRateKey(request)}`, {
      capacity: 5,
      refillPerSec: 0.02,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    if (!customerEmail) {
      return storefrontError("You must be signed in to leave a review", 401, request);
    }

    const body = (await request.json().catch(() => null)) as {
      productId?: unknown;
      rating?: unknown;
      title?: unknown;
      comment?: unknown;
      pros?: unknown;
      cons?: unknown;
      recommendProduct?: unknown;
    } | null;

    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!productId) {
      return storefrontError("Product is required", 400, request);
    }

    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return storefrontError("Select a rating between 1 and 5", 400, request);
    }

    const comment =
      typeof body?.comment === "string" ? body.comment.trim().slice(0, MAX_COMMENT) : "";
    if (!comment) {
      return storefrontError("Please write a review", 400, request);
    }

    const product = await prisma.product.findFirst({
      where: { id: productId, spaceId: ctx.spaceId },
      select: { id: true },
    });
    if (!product) {
      return storefrontError("Product not found", 404, request);
    }

    const customer = await prisma.customer.findUnique({
      where: { spaceId_email: { spaceId: ctx.spaceId, email: customerEmail } },
      select: { id: true, name: true },
    });
    if (!customer) {
      return storefrontError("You must be signed in to leave a review", 401, request);
    }

    // The model has no unique constraint for this, so it's enforced here.
    // Covers every status: a rejected review shouldn't be resubmittable in a
    // loop, and a pending one shouldn't be duplicated by an impatient click.
    const existing = await prisma.review.findFirst({
      where: { spaceId: ctx.spaceId, productId, customerId: customer.id },
      select: { id: true, status: true },
    });
    if (existing) {
      return storefrontError(
        existing.status === "pending"
          ? "Your review for this product is awaiting approval"
          : "You have already reviewed this product",
        409,
        request
      );
    }

    // "Verified purchase" means exactly that: an order that actually completed
    // and contained this product. Pending and cancelled orders don't count.
    const purchase = await prisma.order.findFirst({
      where: {
        spaceId: ctx.spaceId,
        customerId: customer.id,
        status: { in: [...FULFILLED_ORDER_STATUSES] },
        items: { some: { productId } },
      },
      select: { id: true },
    });

    const review = await prisma.review.create({
      data: {
        spaceId: ctx.spaceId,
        productId,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail,
        rating,
        title:
          typeof body?.title === "string" && body.title.trim()
            ? body.title.trim().slice(0, 200)
            : null,
        comment,
        pros: cleanList(body?.pros),
        cons: cleanList(body?.cons),
        recommendProduct: body?.recommendProduct !== false,
        verified: Boolean(purchase),
        status: "pending",
      },
      select: { id: true, status: true, createdAt: true },
    });

    return storefrontSuccess(review, "Thanks, your review will appear once it's approved", request);
  } catch (error) {
    console.error("Storefront review submit error:", error);
    return storefrontError("Failed to submit review", 500, request);
  }
}
