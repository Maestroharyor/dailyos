"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { unwrapAction } from "@/lib/action-mutation";
import { listAuditLogs } from "@/lib/actions/system/audit";

// Types
export interface AuditUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface AuditLog {
  id: string;
  userId: string;
  spaceId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditUser;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  stats: {
    total: number;
    byAction: Record<string, number>;
    lastActivity: string | null;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuditFilters {
  search?: string;
  action?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchAuditLogs(
  spaceId: string,
  filters: AuditFilters
): Promise<AuditLogsResponse> {
  const data = await unwrapAction(listAuditLogs(spaceId, filters));
  return data as unknown as AuditLogsResponse;
}

// Query hooks
export function useAuditLogs(spaceId: string, filters: AuditFilters = {}) {
  return useQuery({
    queryKey: queryKeys.system.audit.list(spaceId, filters),
    queryFn: () => fetchAuditLogs(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useAuditLogsSuspense(spaceId: string, filters: AuditFilters = {}) {
  return useSuspenseQuery({
    queryKey: queryKeys.system.audit.list(spaceId, filters),
    queryFn: () => fetchAuditLogs(spaceId, filters),
  });
}
