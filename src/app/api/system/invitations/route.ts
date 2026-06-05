import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma, SpaceRole } from "@prisma/client";
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_users");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const status = searchParams.get("status"); // pending, expired, accepted, all
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const now = new Date();

    // Build status filter
    let statusFilter: Prisma.SpaceInvitationWhereInput = {};
    if (status === "pending") {
      statusFilter = { expiresAt: { gt: now }, acceptedAt: null };
    } else if (status === "expired") {
      statusFilter = { expiresAt: { lte: now }, acceptedAt: null };
    } else if (status === "accepted") {
      statusFilter = { acceptedAt: { not: null } };
    }

    // Build where clause
    const where: Prisma.SpaceInvitationWhereInput = {
      spaceId,
      ...statusFilter,
      ...(search && {
        email: { contains: search, mode: "insensitive" },
      }),
    };

    // Execute queries in parallel
    const [invitations, total, pendingCount, expiredCount, acceptedCount] = await Promise.all([
      prisma.spaceInvitation.findMany({
        where,
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.spaceInvitation.count({ where }),
      prisma.spaceInvitation.count({
        where: { spaceId, expiresAt: { gt: now }, acceptedAt: null },
      }),
      prisma.spaceInvitation.count({
        where: { spaceId, expiresAt: { lte: now }, acceptedAt: null },
      }),
      prisma.spaceInvitation.count({
        where: { spaceId, acceptedAt: { not: null } },
      }),
    ]);

    // Add computed status to each invitation
    const invitationsWithStatus = invitations.map((inv) => ({
      ...inv,
      status: inv.acceptedAt
        ? "accepted"
        : new Date(inv.expiresAt) <= now
        ? "expired"
        : "pending",
    }));

    return successResponse(
      {
        invitations: invitationsWithStatus,
        stats: {
          total: pendingCount + expiredCount + acceptedCount,
          pending: pendingCount,
          expired: expiredCount,
          accepted: acceptedCount,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Invitations fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return errorResponse("Failed to fetch invitations", 500);
  }
}

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
