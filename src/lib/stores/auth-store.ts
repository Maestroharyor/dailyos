import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
}

const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      login: async (email: string, _password: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: "1",
          name: email.split("@")[0],
          email,
          avatar: `https://i.pravatar.cc/150?u=${email}`,
        };

        set({ user, isAuthenticated: true });
        return true;
      },

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      signup: async (name: string, email: string, _password: string) => {
        await new Promise((resolve) => setTimeout(resolve, 500));

        const user: User = {
          id: "1",
          name,
          email,
          avatar: `https://i.pravatar.cc/150?u=${email}`,
        };

        set({ user, isAuthenticated: true });
        return true;
      },

      logout: () => {
        set({ user: null, isAuthenticated: false });
      },

      updateProfile: (data) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
      },
    }),
    {
      name: "dailyos-auth",
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useLogin = () => useAuthStore((state) => state.login);
export const useSignup = () => useAuthStore((state) => state.signup);
export const useLogout = () => useAuthStore((state) => state.logout);
export const useUpdateProfile = () => useAuthStore((state) => state.updateProfile);
