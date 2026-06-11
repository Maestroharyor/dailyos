"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { listMembers, getMember } from "@/lib/actions/system/members";

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
async function fetchMembers(
  spaceId: string,
  filters: MemberFilters
): Promise<MembersResponse> {
  return unwrapAction(listMembers(spaceId, filters));
}

async function fetchMember(
  spaceId: string,
  memberId: string
): Promise<{ member: Member }> {
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
    onSuccess: () => {
      notifySuccess("Role updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
    onError: (err) => notifyError(err, "Couldn't update role"),
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

      const previousData = queryClient.getQueryData<MembersResponse>(
        queryKeys.system.members.list(spaceId, {})
      );

      if (previousData) {
        queryClient.setQueryData<MembersResponse>(
          queryKeys.system.members.list(spaceId, {}),
          {
            ...previousData,
            members: previousData.members.map((m) =>
              m.id === memberId ? { ...m, status } : m
            ),
          }
        );
      }

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.system.members.list(spaceId, {}),
          context.previousData
        );
      }
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

      const previousData = queryClient.getQueryData<MembersResponse>(
        queryKeys.system.members.list(spaceId, {})
      );

      if (previousData) {
        queryClient.setQueryData<MembersResponse>(
          queryKeys.system.members.list(spaceId, {}),
          {
            ...previousData,
            members: previousData.members.filter((m) => m.id !== memberId),
            pagination: {
              ...previousData.pagination,
              total: previousData.pagination.total - 1,
            },
          }
        );
      }

      return { previousData };
    },
    onError: (err, memberId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          queryKeys.system.members.list(spaceId, {}),
          context.previousData
        );
      }
      notifyError(err, "Couldn't remove user");
    },
    onSuccess: () => notifySuccess("User removed"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
  });
}
