import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { successResponse, errorResponse } from "@/lib/api-response";
import { SpaceRole, MemberStatus, AuditAction, Prisma } from "@prisma/client";

// Roles assignable via member management (owner is intentionally excluded — it
// cannot be granted/changed through this endpoint).
const ASSIGNABLE_ROLES: SpaceRole[] = [
  "admin",
  "commerce_manager",
  "fintrack_manager",
  "mealflow_manager",
  "cashier",
  "viewer",
];
const MEMBER_STATUSES: MemberStatus[] = ["active", "suspended"];

// PATCH /api/system/members/[id] - update a member's role or status.
// Body: { spaceId, role? } or { spaceId, status? }.
export async function PATCH(
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

    const auth = await authorizeAction(spaceId, "manage_users");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }
    const { ctx } = auth;

    const member = await prisma.spaceMember.findFirst({
      where: { id, spaceId },
      include: { user: { select: { name: true } } },
    });
    if (!member) {
      return errorResponse("Member not found", 404);
    }
    if (member.role === "owner") {
      return errorResponse("The space owner cannot be modified", 400);
    }

    const data: Prisma.SpaceMemberUpdateInput = {};
    let action: AuditAction;
    let details: string;

    if (body.role !== undefined) {
      if (!ASSIGNABLE_ROLES.includes(body.role as SpaceRole)) {
        return errorResponse("Invalid role", 400);
      }
      data.role = body.role as SpaceRole;
      action = "user_role_changed";
      details = `Changed ${member.user.name}'s role to ${body.role}`;
    } else if (body.status !== undefined) {
      if (!MEMBER_STATUSES.includes(body.status as MemberStatus)) {
        return errorResponse("Invalid status", 400);
      }
      data.status = body.status as MemberStatus;
      action = body.status === "suspended" ? "user_suspended" : "user_activated";
      details = `${body.status === "suspended" ? "Suspended" : "Activated"} ${member.user.name}`;
    } else {
      return errorResponse("Provide a role or status to update", 400);
    }

    const updated = await prisma.spaceMember.update({
      where: { id: member.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        spaceId,
        action,
        resource: "member",
        resourceId: member.id,
        details,
      },
    });

    return successResponse(updated, "Member updated");
  } catch (error) {
    console.error("Error updating member:", error);
    return errorResponse("Failed to update member", 500);
  }
}

// DELETE /api/system/members/[id]?spaceId=... - remove a member from the space.
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

    const auth = await authorizeAction(spaceId, "manage_users");
    if (!auth.ctx) {
      return errorResponse(auth.error, auth.status);
    }
    const { ctx } = auth;

    const member = await prisma.spaceMember.findFirst({
      where: { id, spaceId },
      include: { user: { select: { name: true } } },
    });
    if (!member) {
      return errorResponse("Member not found", 404);
    }
    if (member.role === "owner") {
      return errorResponse("The space owner cannot be removed", 400);
    }

    await prisma.spaceMember.delete({ where: { id: member.id } });

    await prisma.auditLog.create({
      data: {
        userId: ctx.userId,
        spaceId,
        action: "user_removed",
        resource: "member",
        resourceId: member.id,
        details: `Removed ${member.user.name}`,
      },
    });

    return successResponse({ id: member.id }, "Member removed");
  } catch (error) {
    console.error("Error removing member:", error);
    return errorResponse("Failed to remove member", 500);
  }
}
