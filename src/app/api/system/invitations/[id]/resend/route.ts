import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { sendInviteEmail } from "@/lib/emails/send";

// POST /api/system/invitations/[id]/resend - re-send an invitation email and
// extend its expiry. Body: { spaceId }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const spaceId: unknown = body?.spaceId;
    if (typeof spaceId !== "string" || !spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const auth = await authorizeAction(spaceId, "invite_users");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }
    const { ctx } = auth;

    const invitation = await prisma.spaceInvitation.findFirst({
      where: { id, spaceId },
    });
    if (!invitation) {
      return errorResponse("Invitation not found", 404);
    }
    if (invitation.acceptedAt) {
      return errorResponse("Invitation has already been accepted", 409);
    }

    // Refresh the expiry window, mirroring invitation creation.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const updated = await prisma.spaceInvitation.update({
      where: { id: invitation.id },
      data: { expiresAt },
    });

    const [space, inviter] = await Promise.all([
      prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    ]);

    const emailResult = await sendInviteEmail({
      to: updated.email,
      inviterName: inviter?.name || "A teammate",
      spaceName: space?.name || "a workspace",
      role: updated.role,
      token: updated.token,
    });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        spaceId,
        action: "user_invited",
        resource: "invitation",
        resourceId: updated.id,
        details: `Resent invitation to ${updated.email}`,
      },
    });

    return successResponse(
      { invitation: updated, emailSent: emailResult.success },
      emailResult.success
        ? "Invitation resent"
        : "Invitation refreshed, but the email could not be sent"
    );
  } catch (error) {
    console.error("Error resending invitation:", error);
    return errorResponse("Failed to resend invitation", 500);
  }
}
