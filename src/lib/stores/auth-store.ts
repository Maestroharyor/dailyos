import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoleId } from "@/lib/types/permissions";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  accountId: string;
  roleId: RoleId;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  // Dev mode role switching for testing
  devModeRole: RoleId | null;
  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
  setDevModeRole: (roleId: RoleId | null) => void;
  getEffectiveRole: () => RoleId;
}

const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      devModeRole: null,

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      login: async (email: string, _password: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: "user-owner-1",
          name: email.split("@")[0],
          email,
          avatar: `https://i.pravatar.cc/150?u=${email}`,
          accountId: "", // Will be set by account store
          roleId: "owner", // Default to owner for the logged-in user
        };

        set({ user, isAuthenticated: true, devModeRole: null });
        return true;
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      signup: async (name: string, email: string, _password: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: "user-owner-1",
          name,
          email,
          avatar: `https://i.pravatar.cc/150?u=${email}`,
          accountId: "", // Will be set by account store
          roleId: "owner", // Default to owner for the signed-up user
        };

        set({ user, isAuthenticated: true, devModeRole: null });
        return true;
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, devModeRole: null });
      },

      updateProfile: (data) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
      },

      setDevModeRole: (roleId) => {
        set({ devModeRole: roleId });
      },

      getEffectiveRole: () => {
        const state = get();
        return state.devModeRole ?? state.user?.roleId ?? "viewer";
      },
    }),
    {
      name: "dailyos-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        devModeRole: state.devModeRole,
      }),
    }
  )
);

// Individual hook exports (following CLAUDE.md patterns to avoid infinite loops)
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useLogin = () => useAuthStore((state) => state.login);
export const useSignup = () => useAuthStore((state) => state.signup);
export const useLogout = () => useAuthStore((state) => state.logout);
export const useUpdateProfile = () => useAuthStore((state) => state.updateProfile);
export const useDevModeRole = () => useAuthStore((state) => state.devModeRole);
export const useSetDevModeRole = () => useAuthStore((state) => state.setDevModeRole);
export const useGetEffectiveRole = () => useAuthStore((state) => state.getEffectiveRole);

// Computed hook for effective role (considers dev mode)
export const useEffectiveRole = (): RoleId => {
  const user = useUser();
  const devModeRole = useDevModeRole();
  return devModeRole ?? user?.roleId ?? "viewer";
};
