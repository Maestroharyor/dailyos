import { NextResponse } from "next/server";
import { markVerified } from "@/lib/auth/mark-verified";
import { createClient } from "@/lib/supabase/server";

/**
 * Record that the signed-in user proved their email address.
 *
 * The merchant-side counterpart of POST /api/storefront/customers/verify-email.
 * Same signal, `app_metadata.emailVerified`, for the same reason: with the
 * project's "Confirm email" setting off, GoTrue's autoconfirm path stamps
 * `email_confirmed_at` at signup for everybody, so it reports every account as
 * verified and the middleware gate reading it would be permanently open.
 *
 * `app_metadata` rather than `user_metadata` because only the service role can
 * write it. `user_metadata` is writable by anyone holding a valid access token
 * via `auth.updateUser`, so a merchant could clear their own gate from the
 * browser console.
 *
 * Identity comes from the session cookie, so there is nothing to pass and
 * nothing to spoof: the worst a caller can do is mark themselves verified
 * having already verified, which is what they just did.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, message: "Not signed in" }, { status: 401 });
  }

  try {
    await markVerified(user.id);
  } catch (error) {
    console.error("[auth/mark-verified] could not stamp app_metadata", error);
    return NextResponse.json(
      { success: false, message: "Could not complete verification" },
      { status: 502 }
    );
  }

  /**
   * Deliberately no refreshSession() here.
   *
   * It looks necessary and is not. Everything that gates on this flag reads it
   * through supabase.auth.getUser(), which is a call to the Auth server
   * returning the live user record - not a decode of the access token. The
   * middleware, and on the storefront side both the request hook and the
   * bearer-token check, all see the new value on the very next request without
   * any token being reissued.
   *
   * Refreshing was also actively risky. This runs while the browser still holds
   * a live Supabase client from the verifyOtp call on the same page; rotating
   * the refresh token from the server leaves that client holding a consumed
   * one, and it signs itself out when its own refresh timer fires, roughly an
   * access-token lifetime later. A silent sign-out an hour after verifying is
   * not a failure anyone would connect back to this line.
   *
   * The one thing that does read the token rather than the server is the client
   * useSession() hook, so SessionUser.emailVerified lags until the next natural
   * refresh. Nothing gates on it - it only decides whether /verify-email sends
   * an already-verified merchant onward, and the success path navigates
   * explicitly rather than waiting for that effect.
   */

  return NextResponse.json({ success: true, message: "Email verified" });
}
