import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * Returns the current user's profile basics, including the platform-level
 * isSuperAdmin flag used to gate super-admin-only UI (e.g. the storefront
 * connect panel). 401 when unauthenticated.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse("Unauthorized", 401);
  }

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, isSuperAdmin: true },
  });

  if (!profile) {
    return errorResponse("Profile not found", 404);
  }

  return successResponse(profile, "Profile fetched");
}
