import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT:
     * - _next/static, _next/image (build assets)
     * - favicon and image files
     * - api/storefront/* (public storefront API, x-storefront-key auth)
     * - api/webhooks/* (external webhooks, signature auth, no session)
     * - api/auth/* and auth/callback (auth endpoints set their own cookies)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/storefront|api/webhooks|api/auth|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
