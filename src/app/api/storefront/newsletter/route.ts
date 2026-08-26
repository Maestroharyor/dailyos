import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";

export const NEWSLETTER_TAG = "newsletter";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * POST /api/storefront/newsletter
 *
 * Newsletter signup. There is no subscriber model, and adding one would mean a
 * migration; Customer already carries a `tags` array and is unique per
 * (space, email), so a subscriber is just a Customer tagged "newsletter". That
 * also means subscribers show up filterable in the existing customers page
 * instead of in a table nobody has a screen for.
 *
 * Idempotent: signing up twice is a no-op, and subscribing with the email of an
 * existing buyer tags that buyer rather than creating a duplicate.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(`newsletter:${storefrontRateKey(request)}`, {
      capacity: 5,
      refillPerSec: 0.05,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const body = (await request.json().catch(() => null)) as {
      email?: unknown;
      name?: unknown;
    } | null;

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_PATTERN.test(email)) {
      return storefrontError("Enter a valid email address", 400, request);
    }

    const name =
      typeof body?.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 120)
        : email.split("@")[0];

    const existing = await prisma.customer.findUnique({
      where: { spaceId_email: { spaceId: ctx.spaceId, email } },
      select: { id: true, tags: true },
    });

    if (!existing) {
      await prisma.customer.create({
        data: {
          spaceId: ctx.spaceId,
          name,
          email,
          tags: [NEWSLETTER_TAG],
        },
      });
    } else if (!existing.tags.includes(NEWSLETTER_TAG)) {
      // Never overwrite an existing customer's name from a newsletter form —
      // the name on file came from a real order.
      await prisma.customer.update({
        where: { id: existing.id },
        data: { tags: { push: NEWSLETTER_TAG } },
      });
    }

    return storefrontSuccess({ subscribed: true }, "Subscribed", request);
  } catch (error) {
    console.error("Storefront newsletter error:", error);
    return storefrontError("Failed to subscribe", 500, request);
  }
}
