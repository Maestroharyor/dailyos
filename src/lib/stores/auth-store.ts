"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCallback } from "react";
import type { RoleId } from "@/lib/types/permissions";
import { useSession, signOut } from "@/lib/supabase/use-session";
import { countUnsynced } from "@/lib/offline/outbox";

// User type for compatibility with existing code
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  spaceId: string;
  roleId: RoleId;
}

// Auth store manages space context and dev mode
// User authentication is handled by Better Auth (useSession hook)
interface AuthStore {
  // Current space context
  currentSpaceId: string | null;
  currentSpaceRole: RoleId | null;

  // Dev mode role switching for testing
  devModeRole: RoleId | null;

  // Actions
  setCurrentSpace: (spaceId: string, role: RoleId) => void;
  clearCurrentSpace: () => void;
  setDevModeRole: (roleId: RoleId | null) => void;
  getEffectiveRole: () => RoleId;
  reset: () => void;
}

const initialState = {
  currentSpaceId: null,
  currentSpaceRole: null,
  devModeRole: null,
};

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentSpace: (spaceId, role) => {
        set({ currentSpaceId: spaceId, currentSpaceRole: role });
      },

      clearCurrentSpace: () => {
        set({ currentSpaceId: null, currentSpaceRole: null });
      },

      setDevModeRole: (roleId) => {
        set({ devModeRole: roleId });
      },

      getEffectiveRole: () => {
        const state = get();
        return state.devModeRole ?? state.currentSpaceRole ?? "viewer";
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: "dailyos-auth",
      partialize: (state) => ({
        currentSpaceId: state.currentSpaceId,
        currentSpaceRole: state.currentSpaceRole,
        devModeRole: state.devModeRole,
      }),
    },
  ),
);

// Individual hook exports (following CLAUDE.md patterns to avoid infinite loops)
export const useCurrentSpaceId = () => useAuthStore((state) => state.currentSpaceId);
export const useCurrentSpaceRole = () => useAuthStore((state) => state.currentSpaceRole);
export const useDevModeRole = () => useAuthStore((state) => state.devModeRole);
export const useSetDevModeRole = () => useAuthStore((state) => state.setDevModeRole);
export const useSetCurrentSpace = () => useAuthStore((state) => state.setCurrentSpace);
export const useClearCurrentSpace = () => useAuthStore((state) => state.clearCurrentSpace);
export const useGetEffectiveRole = () => useAuthStore((state) => state.getEffectiveRole);
export const useResetAuthStore = () => useAuthStore((state) => state.reset);

// Computed hook for effective role (considers dev mode)
export const useEffectiveRole = (): RoleId => {
  const currentSpaceRole = useCurrentSpaceRole();
  const devModeRole = useDevModeRole();
  return devModeRole ?? currentSpaceRole ?? "viewer";
};

// ============================================
// Compatibility hooks that wrap Better Auth
// These allow existing components to work with minimal changes
// ============================================

// Hook to get user from Better Auth session
export const useUser = (): User | null => {
  const { data: session } = useSession();
  const currentSpaceId = useCurrentSpaceId();
  const currentSpaceRole = useCurrentSpaceRole();

  if (!session?.user) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatar: session.user.image ?? undefined,
    spaceId: currentSpaceId ?? "",
    roleId: currentSpaceRole ?? "viewer",
  };
};

// Hook to check if user is authenticated
export const useIsAuthenticated = (): boolean => {
  const { data: session, isPending } = useSession();
  if (isPending) return false;
  return !!session?.user;
};

/**
 * Signing out is refused while a queued sale is still waiting to sync.
 *
 * The outbox is scoped to the user who rang the sales, and signing out clears
 * the caches that hold them. The next cashier on that terminal cannot sync
 * work they did not do, so a sign-out here would be the deletion of money that
 * already changed hands at the counter.
 *
 * Returns `{ blocked: true, unsynced }` instead of throwing, so the caller can
 * say what is waiting rather than reporting a failed sign-out.
 */
export interface LogoutResult {
  blocked: boolean;
  unsynced: number;
}

export const useLogout = () => {
  const reset = useResetAuthStore();
  const currentSpaceId = useCurrentSpaceId();

  return useCallback(async (): Promise<LogoutResult> => {
    const unsynced = currentSpaceId ? await countUnsynced(currentSpaceId) : 0;
    if (unsynced > 0) {
      return { blocked: true, unsynced };
    }

    await signOut();
    reset();
    return { blocked: false, unsynced: 0 };
  }, [reset, currentSpaceId]);
};

// Hook to update profile (placeholder - needs API implementation)
export const useUpdateProfile = () => {
  return useCallback(async (_data: Partial<User>) => {
    // TODO: Implement profile update via API
    console.warn("Profile update not yet implemented");
  }, []);
};
