"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export interface MeProfile {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

async function fetchMe(): Promise<MeProfile> {
  const response = await fetch("/api/me");
  if (!response.ok) throw new Error("Failed to fetch profile");
  const json = await response.json();
  return json.data;
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });
}

export function useIsSuperAdmin(): boolean {
  const { data } = useMe();
  return data?.isSuperAdmin ?? false;
}
