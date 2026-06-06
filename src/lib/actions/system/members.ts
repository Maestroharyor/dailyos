"use server";

import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { actionSuccess, actionError } from "@/lib/action-response";

export async function listMembers(
  spaceId: string,
  filters?: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const authResult = await authorizeAction(spaceId, "view_users");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const search = filters?.search || "";
  const role = filters?.role;
  const status = filters?.status;
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 10;

  // Build where clause
  const where: Prisma.SpaceMemberWhereInput = {
    spaceId,
    ...(search && {
      user: {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      },
    }),
    ...(role && role !== "all" && { role: role as Prisma.EnumSpaceRoleFilter }),
    ...(status && status !== "all" && { status: status as Prisma.EnumMemberStatusFilter }),
  };

  // Execute queries in parallel
  const [members, total] = await Promise.all([
    prisma.spaceMember.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.spaceMember.count({ where }),
  ]);

  // Get role counts
  const roleCounts = await prisma.spaceMember.groupBy({
    by: ["role"],
    where: { spaceId },
    _count: true,
  });

  // Get status counts
  const statusCounts = await prisma.spaceMember.groupBy({
    by: ["status"],
    where: { spaceId },
    _count: true,
  });

  const serializedMembers = members.map((member) => ({
    id: member.id,
    userId: member.userId,
    spaceId: member.spaceId,
    role: member.role,
    status: member.status as "active" | "suspended",
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
    },
  }));

  return actionSuccess(
    {
      members: serializedMembers,
      stats: {
        total,
        byRole: Object.fromEntries(roleCounts.map((r) => [r.role, r._count])),
        byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
    "Members fetched successfully"
  );
}

export async function getMember(spaceId: string, id: string) {
  const authResult = await authorizeAction(spaceId, "view_users");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const member = await prisma.spaceMember.findFirst({
    where: { id, spaceId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
        },
      },
    },
  });

  if (!member) {
    return actionError("Member not found");
  }

  const serializedMember = {
    id: member.id,
    userId: member.userId,
    spaceId: member.spaceId,
    role: member.role,
    status: member.status as "active" | "suspended",
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
    },
  };

  return actionSuccess({ member: serializedMember }, "Member fetched successfully");
}
