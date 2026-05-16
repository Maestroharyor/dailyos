import { NextRequest } from "next/server";
import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const spaceId = searchParams.get("spaceId");
    if (!spaceId) {
      return errorResponse("spaceId is required", 400);
    }

    const authResult = await authorizeAction(spaceId, "view_audit_log");
    if (authResult.error) {
      return errorResponse(authResult.error, authResult.status);
    }

    const search = searchParams.get("search") || "";
    const action = searchParams.get("action");
    const userId = searchParams.get("userId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    // Build where clause
    const where: Prisma.AuditLogWhereInput = {
      spaceId,
      ...(search && {
        OR: [
          { details: { contains: search, mode: "insensitive" } },
          { resource: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
        ],
      }),
      ...(action && action !== "all" && { action: action as Prisma.EnumAuditActionFilter }),
      ...(userId && { userId }),
    };

    // Execute queries in parallel
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
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
      prisma.auditLog.count({ where }),
    ]);

    // Get action counts for stats
    const actionCounts = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { spaceId },
      _count: true,
    });

    // Get last activity
    const lastActivity = await prisma.auditLog.findFirst({
      where: { spaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return successResponse(
      {
        logs,
        stats: {
          total,
          byAction: Object.fromEntries(actionCounts.map((a) => [a.action, a._count])),
          lastActivity: lastActivity?.createdAt || null,
        },
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Audit logs fetched successfully"
    );
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return errorResponse("Failed to fetch audit logs", 500);
  }
}
