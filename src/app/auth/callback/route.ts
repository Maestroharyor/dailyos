import { NextResponse } from "next/server";
import { markVerified } from "@/lib/auth/mark-verified";
import { ensureUserSpace } from "@/lib/space-bootstrap";
import { createClient } from "@/lib/supabase/server";

// Handles the Supabase OAuth (Google) PKCE redirect: exchanges the code for a
// session, bootstraps the merchant's default space, then lands on the dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const metaName = data.user.user_metadata?.name;
      await ensureUserSpace(
        data.user.id,
        typeof metaName === "string" ? metaName : null,
        data.user.email ?? null
      );

      /**
       * Every arrival here has proved the address, so stamp it.
       *
       * Google verified it before handing us the identity, and an email link
       * consumed to get here proves the same thing. Without this the middleware
       * gate would send a Google merchant to /verify-email to type a code for
       * an address the provider already confirmed - a dead end that only looks
       * like a bug in the OAuth flow.
       *
       * Best-effort: the session is established either way, and stranding
       * someone on an error page would be worse than a gate they can clear from
       * /verify-email. The refresh is what gets the new flag into the cookie
       * the very next request reads.
       */
      try {
        await markVerified(data.user.id);
        await supabase.auth.refreshSession();
      } catch (markError) {
        console.error("[auth/callback] could not stamp verification (continuing)", markError);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
