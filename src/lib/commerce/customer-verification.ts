/**
 * Whether a customer's email address has been proved.
 *
 * This used to raw-query `auth.users.email_confirmed_at`, on the reasoning that
 * GoTrue's own column cannot under-report the way a stamp of our own could.
 * That reasoning held only while the column meant something.
 *
 * The Supabase project's "Confirm email" setting is being turned off, so that
 * storefront shoppers can sign in before verifying and be gated at checkout
 * instead of at the door. GoTrue's autoconfirm path stamps `email_confirmed_at`
 * at signup, for everybody. After the flip that column does not go quiet, it
 * goes uniformly true: it would report every account as verified while still
 * looking authoritative, and every gate reading it would be silently inert.
 * Over-reporting is strictly worse than the under-reporting we were avoiding.
 *
 * So verification is `Customer.emailVerifiedAt`, written only by
 * POST /api/storefront/customers/verify-email after a real `verifyOtp`, from an
 * identity proved by an access token rather than claimed in a request body.
 *
 * Being a column on the row the caller already fetched, this is now a pure
 * function. The previous version issued a second query per page and carried a
 * "unknown" state for when that query failed against a role without USAGE on
 * the auth schema. Both are gone: there is no second query left to fail.
 *
 * Three states, not two. `Customer.email` is nullable, because walk-in and POS
 * customers are recorded without one, and flagging the counter staff's own
 * records as "not verified" is the obvious wrong answer.
 */
export type EmailVerification = "verified" | "unverified" | "no-email";

interface CustomerVerificationFields {
  email: string | null;
  emailVerifiedAt: Date | null;
}

/**
 * Verification state for one customer row.
 *
 * Per-row rather than a map keyed by id, which is what this was when it needed
 * a second query to answer. Callers already hold the row, so a lookup by id
 * only bought them a `?? "unknown"` fallback for a case that could not happen.
 */
export function emailVerification(customer: CustomerVerificationFields): EmailVerification {
  if (!customer.email?.trim()) return "no-email";
  return customer.emailVerifiedAt ? "verified" : "unverified";
}
