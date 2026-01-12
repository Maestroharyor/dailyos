"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";

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
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.role && filters.role !== "all") params.set("role", filters.role);
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/system/members?${params}`);
  if (!response.ok) throw new Error("Failed to fetch members");
  const result = await response.json();
  return result.data;
}

async function fetchMember(
  spaceId: string,
  memberId: string
): Promise<{ member: Member }> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/system/members/${memberId}?${params}`);
  if (!response.ok) throw new Error("Failed to fetch member");
  const result = await response.json();
  return result.data;
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
      return response.json();
    },
    onSuccess: () => {
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
      return response.json();
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
    },
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
      return response.json();
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
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.members.all });
    },
  });
}
