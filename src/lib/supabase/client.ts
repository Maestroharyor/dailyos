import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Supabase client for Client Components (the (auth) pages, auth store). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
