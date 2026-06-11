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
import { getSpaces } from "@/lib/actions/spaces";
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

      // If no current space is set, use the default (first) space
      if (!currentSpace && data.spaces.length > 0) {
        const defaultSpace = data.spaces[0];
        spaceActions.setCurrentSpace(defaultSpace.space);

        // Set the role in auth store - map SpaceRole to RoleId
        const role = defaultSpace.membership.role as RoleId;
        setAuthSpace(defaultSpace.space.id, role);
      } else if (currentSpace) {
        // Refresh the current space object (name, mode, enabledModules) and role
        // from the server so persisted copies don't go stale.
        const currentSpaceMembership = data.spaces.find(
          (s) => s.space.id === currentSpace.id
        );
        if (currentSpaceMembership) {
          spaceActions.setCurrentSpace(currentSpaceMembership.space);
          const role = currentSpaceMembership.membership.role as RoleId;
          setAuthSpace(currentSpace.id, role);
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
