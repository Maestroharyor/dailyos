"use server";

import { authorizeAction } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { actionSuccess, actionError } from "@/lib/action-response";

export interface ListAuditLogsFilters {
  search?: string;
  action?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

export async function listAuditLogs(
  spaceId: string,
  filters: ListAuditLogsFilters = {}
) {
  try {
    if (!spaceId) {
      return actionError("spaceId is required");
    }

    const authResult = await authorizeAction(spaceId, "view_audit_log");
    if (authResult.error) {
      return actionError(authResult.error);
    }

    const search = filters.search || "";
    const action = filters.action;
    const userId = filters.userId;
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

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

    return actionSuccess(
      {
        // Date -> ISO string to match the audit log entry interface.
        logs: logs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
        stats: {
          total,
          byAction: Object.fromEntries(actionCounts.map((a) => [a.action, a._count])),
          lastActivity: lastActivity?.createdAt.toISOString() || null,
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
    return actionError("Failed to fetch audit logs");
  }
}
