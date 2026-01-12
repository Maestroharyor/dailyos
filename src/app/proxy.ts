import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes accessible only to unauthenticated users
const authRoutes = ["/login", "/signup", "/reset-password", "/verify-email"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root path redirect to login (auth-guard will handle redirect to home if authenticated)
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Let the request continue - auth is handled by AuthGuard component
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (api/*)
     * - static files (_next/static/*, _next/image/*, favicon.ico)
     * - public assets (manifest.*, icons/*)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|manifest|icons).*)",
  ],
};
