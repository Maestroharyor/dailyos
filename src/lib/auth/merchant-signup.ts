import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one path every merchant signup surface goes through.
 *
 * There is exactly one today, but the shape below is easy to get subtly wrong
 * in a second one, and the failure is silent: a surface that skips the explicit
 * send creates an account nobody can verify, and the middleware gate then locks
 * that merchant out of their own dashboard with no email to act on.
 *
 * Two modes, decided by Supabase rather than by us:
 *
 *   session returned - the project's "Confirm email" setting is off. GoTrue
 *                      signed them straight in and sent nothing, so the
 *                      verification code has to be asked for explicitly.
 *   no session       - confirmation is still on and GoTrue has already emailed
 *                      the code itself. Sending again would mail them twice and
 *                      invalidate the first code.
 *
 * Handling both means this is safe to deploy before the setting is flipped,
 * which is the whole point: the switch is only thrown once both apps can cope
 * with either answer.
 */

export interface MerchantSignupInput {
  supabase: SupabaseClient;
  name: string;
  email: string;
  password: string;
  /** Preserves an invite (?callbackUrl=/invite/<token>) through verification. */
  callbackUrl?: string | null;
  origin: string;
}

export interface MerchantSignupResult {
  /** Set when signup itself failed; nothing was created. */
  error?: string;
  /**
   * True when a session was returned, meaning the account is usable right now
   * and the code was requested separately. Callers send the merchant to
   * /verify-email either way - the middleware would anyway - but this is what
   * distinguishes "we asked for a code" from "GoTrue sent one".
   */
  hasSession: boolean;
}

export async function signUpMerchant({
  supabase,
  name,
  email,
  password,
  callbackUrl,
  origin,
}: MerchantSignupInput): Promise<MerchantSignupResult> {
  const emailRedirectTo = `${origin}/auth/callback${
    callbackUrl ? `?next=${encodeURIComponent(callbackUrl)}` : ""
  }`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // role drives the handle_new_user trigger; name populates the profile.
      // app is read by the send-email hook's first rung, which returns platform
      // branding without a database call.
      data: { name, role: "MERCHANT", app: "dailyos" },
      emailRedirectTo,
    },
  });

  if (error) {
    return { error: error.message || "Signup failed. Please try again.", hasSession: false };
  }

  if (data.session) {
    // Nothing was emailed, so ask for the code. Best-effort: the account is
    // real and the merchant is signed in, so a failed send is a "resend" away
    // rather than a reason to fail a signup that already succeeded.
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo },
    });
    if (sendError) {
      console.error("[merchant-signup] verification send failed (continuing)", sendError);
    }
  }

  return { hasSession: Boolean(data.session) };
}
