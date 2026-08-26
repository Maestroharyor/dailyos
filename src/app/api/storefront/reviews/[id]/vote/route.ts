import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * POST /api/storefront/reviews/[id]/vote
 *
 * Marks a review helpful or not. Unlike reviews themselves, votes can't be read
 * straight from VKT's mirror — ReviewVote isn't in its schema — so this is the
 * only path.
 *
 * One vote per identity per review, keyed on the customer when signed in and on
 * the request IP otherwise. Changing your mind flips the existing vote and
 * moves the count across rather than adding a second one; the counters are
 * adjusted in the same transaction as the vote so they can't drift.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rate = checkRateLimit(`review-vote:${storefrontRateKey(request)}`, {
      capacity: 20,
      refillPerSec: 0.2,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      isHelpful?: unknown;
    } | null;

    if (typeof body?.isHelpful !== "boolean") {
      return storefrontError("isHelpful must be true or false", 400, request);
    }
    const isHelpful = body.isHelpful;

    const review = await prisma.review.findFirst({
      // Approved only: a pending review isn't visible, so it can't be voted on.
      where: { id, spaceId: ctx.spaceId, status: "approved" },
      select: { id: true },
    });
    if (!review) {
      return storefrontError("Review not found", 404, request);
    }

    const customerEmail = request.headers.get("x-customer-email")?.trim().toLowerCase() || null;
    const customer = customerEmail
      ? await prisma.customer.findUnique({
          where: { spaceId_email: { spaceId: ctx.spaceId, email: customerEmail } },
          select: { id: true },
        })
      : null;

    // Anonymous votes fall back to IP. Imperfect behind CGNAT, which is common
    // on Nigerian mobile networks, but the alternative is unlimited voting.
    const ipAddress = customer ? null : storefrontRateKey(request);

    const counts = await prisma.$transaction(async (tx) => {
      const existing = await tx.reviewVote.findFirst({
        where: customer
          ? { reviewId: review.id, customerId: customer.id }
          : { reviewId: review.id, ipAddress },
        select: { id: true, isHelpful: true },
      });

      if (existing) {
        if (existing.isHelpful === isHelpful) {
          // Same vote again — nothing to change.
          return tx.review.findUniqueOrThrow({
            where: { id: review.id },
            select: { helpful: true, notHelpful: true },
          });
        }

        await tx.reviewVote.update({
          where: { id: existing.id },
          data: { isHelpful },
        });

        return tx.review.update({
          where: { id: review.id },
          data: isHelpful
            ? { helpful: { increment: 1 }, notHelpful: { decrement: 1 } }
            : { helpful: { decrement: 1 }, notHelpful: { increment: 1 } },
          select: { helpful: true, notHelpful: true },
        });
      }

      await tx.reviewVote.create({
        data: {
          reviewId: review.id,
          customerId: customer?.id ?? null,
          ipAddress,
          isHelpful,
        },
      });

      return tx.review.update({
        where: { id: review.id },
        data: isHelpful ? { helpful: { increment: 1 } } : { notHelpful: { increment: 1 } },
        select: { helpful: true, notHelpful: true },
      });
    });

    return storefrontSuccess(counts, "Vote recorded", request);
  } catch (error) {
    console.error("Storefront review vote error:", error);
    return storefrontError("Failed to record vote", 500, request);
  }
}
