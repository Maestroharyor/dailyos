import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stamp a user as having proved their email address.
 *
 * Shared by POST /api/auth/verify-email, which runs the code exchange, and
 * /auth/callback, which covers OAuth and email links. Both end in a proved
 * address and both must write the same flag, or whichever one was forgotten
 * leaves that route's users stuck behind the middleware gate.
 *
 * Never call this from a route that has not itself just proved the address.
 * The endpoint that did exactly that - stamping on request for any signed-in
 * caller - was a one-POST bypass of the whole gate, and is why the exchange
 * now lives on the server beside this call.
 *
 * app_metadata rather than user_metadata: only the service role can write it,
 * so a merchant cannot clear their own gate from the browser console.
 *
 * Idempotent. Throws so callers decide whether a failure is fatal.
 */
export async function markVerified(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { emailVerified: true },
  });
  if (error) throw error;
}
