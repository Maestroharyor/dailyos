import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { SpaceRole } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";
import { sendInviteEmail } from "@/lib/emails/send";

const INVITABLE_ROLES: SpaceRole[] = [
  "admin",
  "commerce_manager",
  "fintrack_manager",
  "mealflow_manager",
  "cashier",
  "viewer",
];

// POST /api/system/invitations - create (or refresh) an invitation and email it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const spaceId: unknown = body.spaceId;
    const emailRaw: unknown = body.email;
    const roleRaw: unknown = body.role;

    if (typeof spaceId !== "string" || !spaceId) {
      return errorResponse("spaceId is required", 400);
    }
    if (typeof emailRaw !== "string" || !emailRaw.includes("@")) {
      return errorResponse("A valid email is required", 400);
    }
    if (!INVITABLE_ROLES.includes(roleRaw as SpaceRole)) {
      return errorResponse("Invalid role", 400);
    }
    const email = emailRaw.trim().toLowerCase();
    const role = roleRaw as SpaceRole;

    const auth = await authorizeAction(spaceId, "invite_users");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }
    const { ctx } = auth;

    // Already an active member? Nothing to invite.
    const existingMember = await prisma.spaceMember.findFirst({
      where: { spaceId, user: { email } },
      select: { id: true },
    });
    if (existingMember) {
      return errorResponse("That person is already a member of this space", 409);
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Unique on [email, spaceId]: refresh role/expiry and clear any prior accept.
    const invitation = await prisma.spaceInvitation.upsert({
      where: { email_spaceId: { email, spaceId } },
      create: { email, spaceId, role, invitedById: ctx.userId, expiresAt },
      update: { role, expiresAt, acceptedAt: null },
    });

    const [space, inviter] = await Promise.all([
      prisma.space.findUnique({ where: { id: spaceId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    ]);

    const emailResult = await sendInviteEmail({
      to: email,
      inviterName: inviter?.name || "A teammate",
      spaceName: space?.name || "a workspace",
      role,
      token: invitation.token,
    });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        spaceId,
        action: "user_invited",
        resource: "invitation",
        resourceId: invitation.id,
        details: `Invited ${email} as ${role}`,
      },
    });

    return successResponse(
      { invitation, emailSent: emailResult.success },
      emailResult.success
        ? "Invitation sent"
        : "Invitation created, but the email could not be sent"
    );
  } catch (error) {
    console.error("Error creating invitation:", error);
    return errorResponse("Failed to create invitation", 500);
  }
}
