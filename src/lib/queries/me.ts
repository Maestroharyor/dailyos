"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { unwrapAction } from "@/lib/action-mutation";
import { getMe, type MeProfile } from "@/lib/actions/me";

export type { MeProfile };

async function fetchMe(): Promise<MeProfile> {
  return unwrapAction(getMe());
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
