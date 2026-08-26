import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side operations (Storage
 * writes, signed-URL minting). Bypasses RLS, so it must NEVER be imported into
 * client code — only import it from route handlers / server actions.
 *
 * Writes to the public `media` bucket and the private `receipts` bucket are
 * funneled through this client behind `/api/uploads`, which authorizes the
 * caller via `authorizeAction` before any object is created.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
