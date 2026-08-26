import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Refreshes the Supabase auth session cookie on every matched request.
 * Session refresh ONLY — route protection stays in AuthGuard (client) and
 * authorizeAction (server). Do not add redirects here: the matcher passes
 * through public pages, and the storefront API is excluded entirely.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Touch the user to trigger token refresh; result intentionally unused.
  await supabase.auth.getUser();

  return supabaseResponse;
}
