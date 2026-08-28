/**
 * The two public Supabase values every client here needs.
 *
 * These were six `process.env.X!` assertions across the browser, server and
 * middleware clients. The assertion was not wrong about the value being present
 * in practice, but it makes a missing variable fail deep inside
 * `@supabase/ssr` with an opaque error instead of at the boundary that knows
 * what is missing.
 *
 * Read through functions rather than module constants **on purpose**. Next
 * evaluates every module while collecting page data during `next build`, so a
 * throw at module scope makes the build itself depend on runtime configuration
 * being present, which is exactly what broke CI the first time this landed.
 * Called from the client factories instead, the check fires when a client is
 * actually constructed.
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

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
