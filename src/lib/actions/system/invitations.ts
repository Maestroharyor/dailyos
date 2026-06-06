"use server";

import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { actionSuccess, actionError } from "@/lib/action-response";

export interface InvitedBy {
  id: string;
  name: string;
  email: string;
}

export interface Invitation {
  id: string;
  email: string;
  spaceId: string;
  role: string;
  token: string;
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  invitedBy: InvitedBy;
  status: "pending" | "expired" | "accepted";
}

export interface InvitationsResponse {
  invitations: Invitation[];
  stats: {
    total: number;
    pending: number;
    expired: number;
    accepted: number;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface InvitationFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listInvitations(spaceId: string, filters: InvitationFilters = {}) {
  if (!spaceId) {
    return actionError("spaceId is required");
  }

  const authResult = await authorizeAction(spaceId, "view_users");
  if (authResult.error) {
    return actionError(authResult.error);
  }

  const search = filters.search || "";
  const status = filters.status; // pending, expired, accepted, all
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 10;

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
  const invitationsWithStatus: Invitation[] = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    spaceId: inv.spaceId,
    role: inv.role,
    token: inv.token,
    invitedById: inv.invitedById,
    expiresAt: inv.expiresAt.toISOString(),
    acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
    createdAt: inv.createdAt.toISOString(),
    invitedBy: inv.invitedBy,
    status: inv.acceptedAt
      ? "accepted"
      : new Date(inv.expiresAt) <= now
      ? "expired"
      : "pending",
  }));

  const response: InvitationsResponse = {
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
  };

  return actionSuccess(response, "Invitations fetched successfully");
}
