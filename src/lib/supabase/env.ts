/**
 * The two public Supabase values every client here needs.
 *
 * These were six `process.env.X!` assertions across the browser, server and
 * middleware clients. The assertion was not wrong about the value being present
 * in practice, but it makes a missing variable fail deep inside
 * `@supabase/ssr` with an opaque error instead of at the boundary that knows
 * what is missing.
 *
 * Both are `NEXT_PUBLIC_`, so they are inlined into the client bundle and are
 * not secrets. `process.env.NEXT_PUBLIC_*` must be read as a full static member
 * expression for Next.js to substitute it at build time, which is why these are
 * written out rather than looked up by a computed key.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local and restart the dev server.`);
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
