import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who the storefront's caller actually is, proved rather than claimed.
 *
 * Every other storefront route identifies a shopper by an email in the request
 * body or the `x-customer-email` header. That is fine for what those routes do,
 * and the orders route says so plainly in its own comments: the storefront key
 * is held by every visitor to the shop, so nothing there proves the caller owns
 * the address they typed.
 *
 * Two things now need more than that. Marking an address verified, and refusing
 * to attach an order to an unverified account, are both decisions about a
 * specific person, and both are worthless if the person is a string in a body.
 * So the storefront forwards the shopper's Supabase access token and this reads
 * the identity out of it.
 *
 * The token is verified against Supabase rather than decoded locally. That
 * costs a round trip per call, which is the right trade here: these are
 * once-per-verification and once-per-order, and local JWT verification would
 * mean owning JWKS fetching, caching and rotation to save a few milliseconds on
 * a path that is already talking to a payment provider.
 */

export interface StorefrontIdentity {
  userId: string;
  /** Lowercased, because every customer lookup in this codebase matches that way. */
  email: string;
  /**
   * Whether this shopper has proved their address.
   *
   * From `app_metadata`, which only the service role writes, so it cannot be
   * forged from the browser the way `user_metadata` can. Deliberately NOT
   * `email_confirmed_at`: with the project's "Confirm email" setting off,
   * autoconfirm sets that at signup for everyone.
   *
   * Read from the token rather than by looking up a `Customer` row, and that
   * distinction is load-bearing. `Customer.emailVerifiedAt` is per-space and a
   * first-time buyer has no row in this space at all, so a row-based check
   * would reject exactly the shopper the storefront's pre-payment gate had
   * already waved through - after Paystack charged them.
   * `Customer.emailVerifiedAt` remains what the merchant dashboard reads; this
   * is what decides.
   */
  emailVerified: boolean;
}

export type IdentityResult =
  /** No Authorization header. A guest, which most storefront traffic is. */
  | { kind: "anonymous" }
  /** A header was sent and did not check out. Never treat this as a guest. */
  | { kind: "invalid" }
  | { kind: "identified"; identity: StorefrontIdentity };

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token?.trim() || null;
}

/**
 * Resolve the caller's identity from a bearer token, if one was sent.
 *
 * The three-way result is the point. A missing token and a bad token must not
 * collapse into the same answer: guest checkout is open, so "anonymous" is a
 * legitimate state that proceeds, and folding "invalid" into it would let
 * anyone bypass a token check by sending a token that fails to parse. Callers
 * are forced to say what they do about each.
 */
export async function identifyStorefrontCaller(request: NextRequest): Promise<IdentityResult> {
  const token = bearerToken(request);
  if (!token) return { kind: "anonymous" };

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) return { kind: "invalid" };

    return {
      kind: "identified",
      identity: {
        userId: data.user.id,
        email: data.user.email.toLowerCase(),
        // Absent reads as unverified: a missing flag must never be permission.
        emailVerified: data.user.app_metadata?.emailVerified === true,
      },
    };
  } catch (error) {
    // A missing service-role key or an unreachable auth service. Deliberately
    // "invalid" rather than "anonymous": degrading to the guest path would turn
    // an outage into a silently unauthenticated request.
    console.error("[storefront-identity] token verification failed", error);
    return { kind: "invalid" };
  }
}

/**
 * What the orders route should do about the caller, before any database work.
 *
 * A pure function rather than branches inside the handler, because the case
 * that matters is the one that is easy to get wrong in review: an anonymous
 * caller must pass. Guest checkout is open by design, and a version of this
 * that treated "no token" as "not verified" would silently end guest ordering
 * while every test about signed-in shoppers still passed.
 */
export type OrderGate =
  /** Guest checkout. Proceed with no account attached. */
  | { kind: "guest" }
  /** Stop, with the status and message the route should return. */
  | { kind: "reject"; status: number; message: string }
  /**
   * Signed in, consistent and verified. `email` is the proven address, and the
   * caller must attach the order to THAT rather than to whatever the body said:
   * a signed-in shopper who leaves the field blank still owns this order.
   */
  | { kind: "identified"; email: string };

export function orderIdentityGate(caller: IdentityResult, bodyEmail: string | null): OrderGate {
  if (caller.kind === "anonymous") return { kind: "guest" };

  // A token was offered and did not verify. Never downgraded to the guest path:
  // that would make the whole check bypassable by mangling the header.
  if (caller.kind === "invalid") {
    return {
      kind: "reject",
      status: 401,
      message: "Your session could not be verified. Sign in again.",
    };
  }

  // The session and the form belong to different people. Refused rather than
  // reconciled, and the token wins over the body in every other respect too.
  const normalized = bodyEmail?.trim().toLowerCase() || null;
  if (normalized && normalized !== caller.identity.email) {
    return {
      kind: "reject",
      status: 403,
      message: "Order email does not match the signed-in account",
    };
  }

  if (!caller.identity.emailVerified) {
    return {
      kind: "reject",
      status: 403,
      message: "Verify your email address to place orders on your account",
    };
  }

  return { kind: "identified", email: caller.identity.email };
}
