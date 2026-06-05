import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

// DELETE /api/system/invitations/[id]?spaceId=... - revoke a pending invitation.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const spaceId = request.nextUrl.searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const auth = await authorizeAction(spaceId, "invite_users");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }
    const { ctx } = auth;

    // Scope the lookup to the space so an id from another space can't be revoked.
    const invitation = await prisma.spaceInvitation.findFirst({
      where: { id, spaceId },
      select: { id: true, email: true },
    });
    if (!invitation) {
      return errorResponse("Invitation not found", 404);
    }

    await prisma.spaceInvitation.delete({ where: { id: invitation.id } });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        spaceId,
        action: "invitation_revoked",
        resource: "invitation",
        resourceId: invitation.id,
        details: `Revoked invitation for ${invitation.email}`,
      },
    });

    return successResponse({ id: invitation.id }, "Invitation revoked");
  } catch (error) {
    console.error("Error revoking invitation:", error);
    return errorResponse("Failed to revoke invitation", 500);
  }
}
