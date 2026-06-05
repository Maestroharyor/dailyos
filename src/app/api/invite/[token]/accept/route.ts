import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";

// POST /api/invite/[token]/accept - the signed-in user joins the invited space.
// Requires a session whose email matches the invitation. Idempotent.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errorResponse("You must be signed in to accept an invitation", 401);
    }

    const invitation = await prisma.spaceInvitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      return errorResponse("Invitation not found", 404);
    }

    if (!invitation.acceptedAt && invitation.expiresAt <= new Date()) {
      return errorResponse("This invitation has expired", 410);
    }

    if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
      return errorResponse(
        "This invitation was sent to a different email address",
        403
      );
    }

    // Create the membership if it doesn't already exist (the profiles row is
    // created synchronously by the handle_new_user trigger at signup, so the
    // space_members.userId FK target exists by now).
    const existing = await prisma.spaceMember.findUnique({
      where: { userId_spaceId: { userId: user.id, spaceId: invitation.spaceId } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.spaceMember.create({
        data: {
          userId: user.id,
          spaceId: invitation.spaceId,
          role: invitation.role,
          status: "active",
        },
      });
    }

    if (!invitation.acceptedAt) {
      await prisma.spaceInvitation.update({
        where: { token },
        data: { acceptedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        spaceId: invitation.spaceId,
        action: "invitation_accepted",
        resource: "invitation",
        resourceId: invitation.id,
        details: `Joined as ${invitation.role}`,
      },
    });

    return successResponse({ spaceId: invitation.spaceId }, "Invitation accepted");
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return errorResponse("Failed to accept invitation", 500);
  }
}
