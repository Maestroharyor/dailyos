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

  // Pulls the new app_metadata into a fresh token and, through the SSR cookie
  // handler, into the browser. Without this the middleware would keep reading
  // the old JWT and bouncing them back here after a successful verification.
  await supabase.auth.refreshSession();

  return NextResponse.json({ success: true, message: "Email verified" });
}
