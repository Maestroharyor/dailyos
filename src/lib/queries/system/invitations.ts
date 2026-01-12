"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";

// Types
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

// Fetch functions
async function fetchInvitations(
  spaceId: string,
  filters: InvitationFilters
): Promise<InvitationsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/system/invitations?${params}`);
  if (!response.ok) throw new Error("Failed to fetch invitations");
  const result = await response.json();
  return result.data;
}

// Query hooks
export function useInvitations(spaceId: string, filters: InvitationFilters = {}) {
  return useQuery({
    queryKey: queryKeys.system.invitations.list(spaceId, filters),
    queryFn: () => fetchInvitations(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useInvitationsSuspense(spaceId: string, filters: InvitationFilters = {}) {
  return useSuspenseQuery({
    queryKey: queryKeys.system.invitations.list(spaceId, filters),
    queryFn: () => fetchInvitations(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateInvitation(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const response = await fetch("/api/system/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, email, role }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create invitation");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.invitations.all });
    },
  });
}

export function useRevokeInvitation(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await fetch(`/api/system/invitations/${invitationId}?spaceId=${spaceId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to revoke invitation");
      return response.json();
    },
    onMutate: async (invitationId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.system.invitations.all });

      const previousData = queryClient.getQueryData<InvitationsResponse>(
        queryKeys.system.invitations.list(spaceId, {})
      );

      if (previousData) {
        queryClient.setQueryData<InvitationsResponse>(
          queryKeys.system.invitations.list(spaceId, {}),
          {
            ...previousData,
            invitations: previousData.invitations.filter((i) => i.id !== invitationId),
            stats: {
              ...previousData.stats,
              total: previousData.stats.total - 1,
              pending: previousData.stats.pending - 1,
            },
            pagination: {
              ...previousData.pagination,
              total: previousData.pagination.total - 1,
            },
          }
        );
      }

      return { previousData };
    },
    onError: (err, invitationId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.system.invitations.list(spaceId, {}),
          context.previousData
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.invitations.all });
    },
  });
}

export function useResendInvitation(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await fetch(`/api/system/invitations/${invitationId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId }),
      });
      if (!response.ok) throw new Error("Failed to resend invitation");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.invitations.all });
    },
  });
}
