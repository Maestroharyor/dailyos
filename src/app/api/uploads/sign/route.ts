import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { successResponse, errorResponse } from "@/lib/api-response";

// GET /api/uploads/sign?path=<spaceId>/receipts/<file> - mints a short-lived
// signed URL for a private receipts object. Authorized against the spaceId
// encoded in the path prefix.
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get("path");
    if (!path) {
      return errorResponse("path is required", 400);
    }

    const spaceId = path.split("/")[0];
    if (!spaceId) {
      return errorResponse("Invalid path", 400);
    }

    const auth = await authorizeAction(spaceId, "view_finances");
    if (auth.error) {
      return errorResponse(auth.error, auth.status);
    }

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("receipts")
      .createSignedUrl(path, 60 * 60);

    if (error || !data) {
      return errorResponse("Could not sign receipt URL", 404);
    }

    return successResponse({ url: data.signedUrl }, "Signed");
  } catch (error) {
    console.error("Error signing receipt URL:", error);
    return errorResponse("Failed to sign URL", 500);
  }
}
