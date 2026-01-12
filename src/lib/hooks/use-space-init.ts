"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { useSpaceActions, useCurrentSpace } from "@/lib/stores/space-store";
import { useSetCurrentSpace as useSetAuthSpace } from "@/lib/stores/auth-store";
import type { SpaceRole } from "@/lib/stores/space-store";
import type { RoleId } from "@/lib/types/permissions";

interface SpaceWithMembership {
  space: {
    id: string;
    name: string;
    slug: string;
    mode: "internal" | "commerce";
    ownerId: string;
    createdAt: string;
    updatedAt: string;
  };
  membership: {
    id: string;
    role: SpaceRole;
    status: "active" | "suspended";
    createdAt: string;
  };
}

interface SpacesResponse {
  spaces: SpaceWithMembership[];
  defaultSpaceId: string | null;
}

export function useSpaceInit() {
  const { data: session, isPending: isSessionLoading } = useSession();
  const spaceActions = useSpaceActions();
  const setAuthSpace = useSetAuthSpace();
  const currentSpace = useCurrentSpace();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpaces = useCallback(async () => {
    if (!session?.user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/spaces");
      if (!response.ok) {
        throw new Error("Failed to fetch spaces");
      }

      const data: SpacesResponse = await response.json();

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
        // Update role for current space
        const currentSpaceMembership = data.spaces.find(
          (s) => s.space.id === currentSpace.id
        );
        if (currentSpaceMembership) {
          const role = currentSpaceMembership.membership.role as RoleId;
          setAuthSpace(currentSpace.id, role);
        }
      }

      setIsInitialized(true);
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

  // Reset when user logs out
  useEffect(() => {
    if (!session?.user && isInitialized) {
      setIsInitialized(false);
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
