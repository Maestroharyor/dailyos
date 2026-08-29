import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";
import { identifyStorefrontCaller } from "@/lib/storefront-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Record that a shopper proved their email address.
 *
 * Called by the storefront immediately after a successful `verifyOtp`, on both
 * routes that can produce one: the typed code and the emailed link.
 *
 * The identity comes from the access token that `verifyOtp` just returned, not
 * from the request body. That distinction is the whole security content of this
 * route: the storefront key is held by every visitor to the shop, so a
 * body-supplied address would make this "mark any email verified" for anyone
 * who reads the page source.
 *
 * Why a column of our own rather than `auth.users.email_confirmed_at`: with the
 * project's "Confirm email" setting off, GoTrue's autoconfirm path stamps that
 * column at signup for everybody, so it reports every account as verified. See
 * lib/commerce/customer-verification.ts.
 */

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(`verify-email:${storefrontRateKey(request)}`, {
      capacity: 10,
      refillPerSec: 0.2,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid storefront key", 401, request);
    }

    const caller = await identifyStorefrontCaller(request);
    if (caller.kind !== "identified") {
      // Both the missing-token and bad-token cases. Unlike the orders route,
      // there is no guest path here: an anonymous caller has nothing to verify.
      return storefrontError("A verified session is required", 401, request);
    }

    const { userId, email } = caller.identity;
    const verifiedAt = new Date();

    /**
     * Every Customer row for this address, not only the calling space's.
     *
     * The address was proved once, and that proof is not space-scoped. Writing
     * only the caller's row would leave the same person showing verified in one
     * merchant's dashboard and unverified in another's, while the gate they
     * actually pass through - the app_metadata flag below - is a single global
     * boolean either way. Two signals that disagree is the bug; this is the
     * side that scales.
     *
     * Matched on the lowercased address from the token. Storefront routes
     * normalise, but the merchant-side create and update do not, so a
     * dashboard-entered address can carry mixed case.
     */
    const stamped = await prisma.customer.updateMany({
      where: { email, emailVerifiedAt: null },
      data: { emailVerifiedAt: verifiedAt },
    });

    /**
     * The flag the storefront actually gates on, in app_metadata rather than
     * user_metadata.
     *
     * user_metadata is writable by anyone holding a valid access token via
     * auth.updateUser, which makes it worthless for this: a shopper could mark
     * themselves verified from the browser console. app_metadata is
     * service-role only, and it rides in the JWT, so the storefront reads it
     * off the session on every request without a database call.
     *
     * Written after the column, so a failure here leaves the merchant-facing
     * record correct and the gate closed, which is the safe way round. The
     * storefront retries the whole call rather than reporting success, and this
     * route is idempotent so a retry costs nothing.
     */
    const admin = createAdminClient();
    const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { emailVerified: true },
    });
    if (metadataError) {
      console.error("[verify-email] could not stamp app_metadata", metadataError);
      return storefrontError("Could not complete verification", 502, request);
    }

    return storefrontSuccess(
      { email, verifiedAt: verifiedAt.toISOString(), customersUpdated: stamped.count },
      "Email verified",
      request
    );
  } catch (error) {
    console.error("[verify-email] failed", error);
    return storefrontError("Could not complete verification", 500, request);
  }
}
