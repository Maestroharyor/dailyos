import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Reads/writes the auth cookies via next/headers. The setAll try/catch guards
 * the Server Component case where cookies are read-only (token refresh then
 * happens in middleware instead).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component — safe to ignore; middleware
          // refreshes the session cookie on the next request.
        }
      },
    },
  });
}
