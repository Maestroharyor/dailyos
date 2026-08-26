"use client";

import { useQuery, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { patchLists, restoreLists } from "../optimistic";
import { unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { listInvitations } from "@/lib/actions/system/invitations";

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
  filters: InvitationFilters,
): Promise<InvitationsResponse> {
  const status = filters.status && filters.status !== "all" ? filters.status : undefined;
  return unwrapAction(
    listInvitations(spaceId, {
      search: filters.search,
      status,
      page: filters.page,
      limit: filters.limit,
    }),
  );
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
      const json = await response.json();
      return json.data;
    },
    onSuccess: () => {
      notifySuccess("Invitation sent");
      queryClient.invalidateQueries({ queryKey: queryKeys.system.invitations.all });
    },
    onError: (err) => notifyError(err, "Couldn't send invitation"),
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
      const json = await response.json();
      return json.data;
    },
    onMutate: async (invitationId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.system.invitations.all });

      const previous = patchLists<InvitationsResponse>(
        queryClient,
        queryKeys.system.invitations.lists(spaceId),
        (data) => {
          const invitations = data.invitations.filter((i) => i.id !== invitationId);
          if (invitations.length === data.invitations.length) return data;
          return {
            ...data,
            invitations,
            stats: {
              ...data.stats,
              total: Math.max(0, data.stats.total - 1),
              pending: Math.max(0, data.stats.pending - 1),
            },
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        },
      );

      return { previous };
    },
    onError: (err, invitationId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't revoke invitation");
    },
    onSuccess: () => notifySuccess("Invitation revoked"),
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
      const json = await response.json();
      return json.data;
    },
    onSuccess: () => {
      notifySuccess("Invitation resent");
      queryClient.invalidateQueries({ queryKey: queryKeys.system.invitations.all });
    },
    onError: (err) => notifyError(err, "Couldn't resend invitation"),
  });
}
