import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateStorefrontKey,
  storefrontSuccess,
  storefrontError,
  corsResponse,
} from "@/lib/storefront-auth";
import {
  checkRateLimit,
  storefrontRateKey,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * Corrects profiles.role to CUSTOMER for storefront users who signed up via
 * OAuth. signInWithOAuth can't pass signup metadata, so the handle_new_user
 * trigger stamps such users with the MERCHANT default. Storefronts call this
 * after every OAuth sign-in (idempotent).
 *
 * Auth: x-storefront-key proves the request comes from a trusted storefront;
 * the bearer token proves which user is signing in. The membership guard
 * ensures a genuine DailyOS merchant signing into the storefront is never
 * downgraded.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(`promote-role:${storefrontRateKey(request)}`, {
      capacity: 10,
      refillPerSec: 0.5,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return storefrontError("Missing access token", 401, request);
    }

    const admin = createAdminClient();
    const {
      data: { user },
      error: tokenError,
    } = await admin.auth.getUser(token);
    if (tokenError || !user) {
      return storefrontError("Invalid access token", 401, request);
    }

    // Never downgrade a real merchant: anyone who owns or belongs to a space
    // keeps their role untouched.
    const [ownedSpaces, memberships] = await Promise.all([
      prisma.space.count({ where: { ownerId: user.id } }),
      prisma.spaceMember.count({ where: { userId: user.id } }),
    ]);
    if (ownedSpaces > 0 || memberships > 0) {
      return storefrontSuccess({ role: "MERCHANT", changed: false }, "User is a merchant; role unchanged", request);
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });
    if (!profile) {
      // handle_new_user trigger hasn't landed the profiles row yet — the
      // storefront treats this as retryable.
      return storefrontError("Profile not ready, retry shortly", 503, request);
    }

    if (profile.role !== "CUSTOMER") {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "CUSTOMER" },
      });
    }

    return storefrontSuccess(
      { role: "CUSTOMER", changed: profile.role !== "CUSTOMER" },
      "Role set to CUSTOMER",
      request
    );
  } catch (error) {
    console.error("Storefront promote-role POST error:", error);
    return storefrontError("Failed to update role", 500, request);
  }
}
