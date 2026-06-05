import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureUserSpace } from "@/lib/space-bootstrap";

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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
