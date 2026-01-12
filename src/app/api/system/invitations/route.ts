import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return errorResponse("Unauthorized", 401);
    }

    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status"); // pending, expired, accepted, all
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

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
