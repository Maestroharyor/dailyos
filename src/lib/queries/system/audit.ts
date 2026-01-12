"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { queryKeys } from "../keys";

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
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.action && filters.action !== "all") params.set("action", filters.action);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/system/audit?${params}`);
  if (!response.ok) throw new Error("Failed to fetch audit logs");
  const result = await response.json();
  return result.data;
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
