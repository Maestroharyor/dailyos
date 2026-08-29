/**
 * One identity, two ways to prove it.
 *
 * Read from `app_metadata`, which only the service role can write, so a user
 * cannot set it from the browser the way they can with `user_metadata`.
 *
 * Deliberately NOT `email_confirmed_at`: with the project's "Confirm email"
 * setting off, GoTrue's autoconfirm path stamps that column at signup for
 * everybody, so anything reading it would treat every account as verified,
 * including the ones that never were.
 *
 * Absent reads as unverified. A missing flag must never be permission.
 *
 * Lives here rather than beside any one caller because there are four, spread
 * across layers that cannot see each other - the middleware gate, the
 * invite-accept mutation (which the middleware misses, since /api is exempt),
 * the client session mapper and the storefront bearer path. A second inline
 * copy is a definition that drifts from the tested one, and when the middleware
 * and the page it redirects to disagree, the result is a redirect loop rather
 * than a wrong badge.
 */

interface Identity {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
}

export interface VerifiableUser {
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  identities?: Identity[] | null;
}

/**
 * An identity provider has already proved this address, so we do not ask again.
 *
 * Google confirms the address before it hands over the identity, and making a
 * merchant type a code for it is a dead end that only looks like a bug in the
 * OAuth flow. /auth/callback does stamp `app_metadata` on arrival, but that
 * write is best-effort by design: it needs the service-role key, and if that
 * key is missing or wrong in the deployment the write fails silently and the
 * merchant is trapped with no signal anywhere. Reading the assertion directly
 * removes the dependency rather than adding a retry to it.
 *
 * Safe to trust: `identities` comes back from `supabase.auth.getUser()`, a live
 * call to the Auth server, and `identity_data` is written by GoTrue from the
 * provider's ID token. Nothing user-writable reaches it - the same property
 * that made `app_metadata` acceptable here and `user_metadata` not.
 *
 * Three conditions, and each one is load-bearing:
 *
 *   - `provider !== "email"`. GoTrue's own email identity carries an
 *     `email_verified` field too, and autoconfirm sets it at signup exactly as
 *     it sets `email_confirmed_at`. Trusting it would reintroduce the whole
 *     problem this module exists to avoid, through a different field name.
 *   - `email_verified === true`, not merely present. A provider that declines
 *     to assert it has not proved anything.
 *   - the identity's own address matches the account's. Otherwise a linked
 *     identity for some *other* verified address would vouch for the primary
 *     one, which is a way to get an unproven address past the gate by proving a
 *     different one.
 */
function hasProviderVerifiedIdentity(user: VerifiableUser): boolean {
  const accountEmail = user.email?.toLowerCase();
  if (!accountEmail) return false;

  return (user.identities ?? []).some((identity) => {
    if (!identity.provider || identity.provider === "email") return false;
    const data = identity.identity_data;
    if (data?.email_verified !== true) return false;
    return typeof data.email === "string" && data.email.toLowerCase() === accountEmail;
  });
}

export function isEmailVerified(user: VerifiableUser): boolean {
  if (user.app_metadata?.emailVerified === true) return true;
  return hasProviderVerifiedIdentity(user);
}
