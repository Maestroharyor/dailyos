import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isEmailVerified } from "@/lib/auth/email-verified";
import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Paths an unverified merchant must still reach, or the redirect eats itself.
 *
 * /verify-email is the destination, so exempting it is what stops the loop.
 * The auth pages have to stay reachable so someone can sign out and use a
 * different account, and /auth/callback completes the OAuth and email-link
 * exchanges that produce the session in the first place. API routes answer with
 * status codes rather than pages, and redirecting a fetch to an HTML page turns
 * a clean 401 into a JSON parse error at the call site - including on
 * /api/auth/verify-email, which is the very call that clears this gate.
 *
 * That exemption is broad, so any route under /api that must not run for an
 * unverified user has to say so itself. api/invite/[token]/accept is the one
 * that does today: /invite is kept off this list precisely so an invitee
 * verifies first, and the mutation behind that page would otherwise be
 * reachable directly.
 */
const EXEMPT_PREFIXES = [
  "/verify-email",
  "/login",
  "/signup",
  "/reset-password",
  "/auth/callback",
  "/api",
];

export function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The query string the gate sends someone to /verify-email with.
 *
 * Split out from the redirect so the thing worth asserting is a string rather
 * than a NextResponse: that the destination survives.
 */
export function verifyEmailQuery(destination: string, email: string | null): string {
  const params = new URLSearchParams();
  params.set("callbackUrl", destination);
  if (email) params.set("email", email);
  return `?${params.toString()}`;
}

/**
 * Refreshes the Supabase auth session cookie, and holds the one gate that has
 * to run before anything renders.
 *
 * This used to say "session refresh ONLY, do not add redirects here", and that
 * was right while GoTrue owned the gate: a merchant with an unconfirmed email
 * simply had no session, so there was nothing to redirect. Turning the
 * project's "Confirm email" setting off, so storefront shoppers can browse
 * before verifying, ends that. Merchants now get a session immediately too, and
 * something has to stop an unverified one reaching the dashboard.
 *
 * Here rather than in AuthGuard because AuthGuard is a client component: it
 * renders, then redirects, so the dashboard would flash before disappearing.
 * The check is also free here - updateSession already calls getUser() and threw
 * the result away, and the flag rides in that same user object.
 *
 * Everything else stays where it was. This is the only redirect, and it is
 * about identity rather than authorization; capability checks remain in
 * authorizeAction and onboarding remains in AuthGuard.
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !isEmailVerified(user) && !isExempt(request.nextUrl.pathname)) {
    /**
     * Carry the destination, do not discard it.
     *
     * /verify-email already knows how to return someone to a callbackUrl - that
     * is how the signup flow preserves an invite through verification. But a
     * merchant who arrives on a deep link with an existing unverified session
     * never goes through signup, and clearing the query string here dropped
     * where they were going. /invite/[token] is the case that stings: it is
     * deliberately not exempt, because an invitee should verify first, so
     * losing the token silently broke the invite-accept flow.
     *
     * Email is added too, since this page falls back to it when there is no
     * session user to read one from.
     */
    const url = request.nextUrl.clone();
    url.pathname = "/verify-email";
    url.search = verifyEmailQuery(
      request.nextUrl.pathname + request.nextUrl.search,
      user.email ?? null
    );
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
