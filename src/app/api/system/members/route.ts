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
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

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

    return successResponse(
      {
        members,
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
  } catch (error) {
    console.error("Error fetching members:", error);
    return errorResponse("Failed to fetch members", 500);
  }
}
