import { NextRequest } from "next/server";
import { authorizeSuperAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

/**
 * Storefront connection status for a space. Super-admin only (the key is a
 * secret). Returns the target space's enabled/key plus the single space that is
 * currently connected platform-wide (for the "this will disconnect X" warning).
 */
export async function GET(request: NextRequest) {
  const spaceId = request.nextUrl.searchParams.get("spaceId");
  if (!spaceId) {
    return errorResponse("spaceId is required", 400);
  }

  const auth = await authorizeSuperAdmin();
  if (auth.error) {
    return errorResponse(auth.error, auth.status);
  }

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, name: true, storefrontEnabled: true, storefrontKey: true },
  });
  if (!space) {
    return errorResponse("Space not found", 404);
  }

  const connected = await prisma.space.findFirst({
    where: { storefrontEnabled: true },
    select: { id: true, name: true },
  });

  return successResponse(
    {
      spaceId: space.id,
      enabled: space.storefrontEnabled,
      key: space.storefrontKey,
      connectedSpace: connected,
    },
    "Storefront status fetched"
  );
}
