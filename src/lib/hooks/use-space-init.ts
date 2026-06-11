"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/lib/supabase/use-session";
import {
  useSpaceActions,
  useCurrentSpace,
  useIsSpaceInitialized,
} from "@/lib/stores/space-store";
import { useSetCurrentSpace as useSetAuthSpace } from "@/lib/stores/auth-store";
import { unwrapAction } from "@/lib/action-mutation";
import { getSpaces, setActiveSpace } from "@/lib/actions/spaces";
import type { RoleId } from "@/lib/types/permissions";

export function useSpaceInit() {
  const { data: session, isPending: isSessionLoading } = useSession();
  const spaceActions = useSpaceActions();
  const setAuthSpace = useSetAuthSpace();
  const currentSpace = useCurrentSpace();
  // Global flag (store) so this survives remounts on navigation — one fetch/session.
  const isInitialized = useIsSpaceInitialized();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!session?.user) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await unwrapAction(getSpaces());

      // Set spaces in store
      const spaces = data.spaces.map((s) => s.space);
      spaceActions.setSpaces(spaces);

      // Honor a still-valid persisted selection; otherwise resume the server's
      // last-used space (data.defaultSpaceId), falling back to the first.
      const persisted = currentSpace
        ? data.spaces.find((s) => s.space.id === currentSpace.id)
        : undefined;
      const target =
        persisted ??
        data.spaces.find((s) => s.space.id === data.defaultSpaceId) ??
        data.spaces[0];

      if (target) {
        // Always refresh the space object (name, mode, enabledModules) + role so
        // persisted copies don't go stale.
        spaceActions.setCurrentSpace(target.space);
        setAuthSpace(target.space.id, target.membership.role as RoleId);

        // If the local choice differs from what the server remembers, sync it so
        // other devices resume the same space.
        if (target.space.id !== data.defaultSpaceId) {
          setActiveSpace(target.space.id).catch(() => null);
        }
      }

      spaceActions.setSpaceInitialized(true);
    } catch (err) {
      console.error("Error initializing spaces:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [session?.user, currentSpace, spaceActions, setAuthSpace]);

  // Fetch spaces when session is ready
  useEffect(() => {
    if (session?.user && !isInitialized && !isLoading) {
      fetchSpaces();
    }
  }, [session?.user, isInitialized, isLoading, fetchSpaces]);

  // Reset when user logs out (reset() also clears isSpaceInitialized).
  useEffect(() => {
    if (!session?.user && isInitialized) {
      spaceActions.reset();
    }
  }, [session?.user, isInitialized, spaceActions]);

  return {
    isInitialized,
    isLoading: isSessionLoading || isLoading,
    error,
    refetch: fetchSpaces,
  };
}
