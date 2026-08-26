"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapAction } from "@/lib/action-mutation";
import { getMember, listMembers } from "@/lib/actions/system/members";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";
import { patchLists, restoreLists } from "../optimistic";

// Types
export interface MemberUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface Member {
  id: string;
  userId: string;
  spaceId: string;
  role: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
  user: MemberUser;
}

export interface MembersResponse {
  members: Member[];
  stats: {
    total: number;
    byRole: Record<string, number>;
    byStatus: Record<string, number>;
  };
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface MemberFilters {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchMembers(spaceId: string, filters: MemberFilters): Promise<MembersResponse> {
  return unwrapAction(listMembers(spaceId, filters));
}

async function fetchMember(spaceId: string, memberId: string): Promise<{ member: Member }> {
  return unwrapAction(getMember(spaceId, memberId));
}

// Query hooks
export function useMembers(spaceId: string, filters: MemberFilters = {}) {
  return useQuery({
    queryKey: queryKeys.system.members.list(spaceId, filters),
    queryFn: () => fetchMembers(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useMembersSuspense(spaceId: string, filters: MemberFilters = {}) {
  return useSuspenseQuery({
    queryKey: queryKeys.system.members.list(spaceId, filters),
    queryFn: () => fetchMembers(spaceId, filters),
  });
}

export function useMember(spaceId: string, memberId: string) {
  return useQuery({
    queryKey: queryKeys.system.members.detail(spaceId, memberId),
    queryFn: () => fetchMember(spaceId, memberId),
    enabled: !!spaceId && !!memberId,
  });
}

// Mutation hooks
export function useUpdateMemberRole(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const response = await fetch(`/api/system/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, role }),
      });
      if (!response.ok) throw new Error("Failed to update member role");
      const json = await response.json();
      return json.data;
    },
    // Had no onMutate: changing a role left the old one on screen until the
    // refetch came back, which reads as the change not having taken.
    onMutate: async ({ memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.system.members.all });

      const previous = patchLists<MembersResponse>(
        queryClient,
        queryKeys.system.members.lists(spaceId),
        (data) => ({
          ...data,
          members: data.members.map((m) => (m.id === memberId ? { ...m, role } : m)),
        }),
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Role updated"),
    onError: (err, variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update role");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
  });
}

export function useUpdateMemberStatus(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      status,
    }: {
      memberId: string;
      status: "active" | "suspended";
    }) => {
      const response = await fetch(`/api/system/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId, status }),
      });
      if (!response.ok) throw new Error("Failed to update member status");
      const json = await response.json();
      return json.data;
    },
    onMutate: async ({ memberId, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.system.members.all });

      const previous = patchLists<MembersResponse>(
        queryClient,
        queryKeys.system.members.lists(spaceId),
        (data) => ({
          ...data,
          members: data.members.map((m) => (m.id === memberId ? { ...m, status } : m)),
        }),
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update status");
    },
    onSuccess: () => notifySuccess("Status updated"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
  });
}

export function useRemoveMember(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const response = await fetch(`/api/system/members/${memberId}?spaceId=${spaceId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove member");
      const json = await response.json();
      return json.data;
    },
    onMutate: async (memberId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.system.members.all });

      const previous = patchLists<MembersResponse>(
        queryClient,
        queryKeys.system.members.lists(spaceId),
        (data) => {
          const members = data.members.filter((m) => m.id !== memberId);
          if (members.length === data.members.length) return data;
          return {
            ...data,
            members,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        },
      );

      return { previous };
    },
    onError: (err, memberId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't remove user");
    },
    onSuccess: () => notifySuccess("User removed"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
  });
}
