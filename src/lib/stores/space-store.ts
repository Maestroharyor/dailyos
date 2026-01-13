import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// Client-safe types (matching Prisma enums)
export type SpaceMode = "internal" | "commerce";
export type SpaceRole =
  | "owner"
  | "admin"
  | "commerce_manager"
  | "fintrack_manager"
  | "mealflow_manager"
  | "cashier"
  | "viewer";
export type MemberStatus = "active" | "suspended";

// Space user info
export interface SpaceUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

// Space member
export interface SpaceMember {
  id: string;
  userId: string;
  spaceId: string;
  role: SpaceRole;
  status: MemberStatus;
  createdAt: string;
  user: SpaceUser;
}

// Space
export interface Space {
  id: string;
  name: string;
  slug: string;
  mode: SpaceMode;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// Space invitation
export interface SpaceInvitation {
  id: string;
  email: string;
  role: SpaceRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string };
}

interface SpaceState {
  spaces: Space[];
  currentSpace: Space | null;
  members: SpaceMember[];
  invitations: SpaceInvitation[];
  isLoading: boolean;
  _hasHydrated: boolean;
}

interface SpaceActions {
  setSpaces: (spaces: Space[]) => void;
  setCurrentSpace: (space: Space | null) => void;
  setMembers: (members: SpaceMember[]) => void;
  setInvitations: (invitations: SpaceInvitation[]) => void;
  setLoading: (loading: boolean) => void;
  addSpace: (space: Space) => void;
  updateSpace: (spaceId: string, data: Partial<Space>) => void;
  removeSpace: (spaceId: string) => void;
  addMember: (member: SpaceMember) => void;
  updateMember: (memberId: string, data: Partial<SpaceMember>) => void;
  removeMember: (memberId: string) => void;
  addInvitation: (invitation: SpaceInvitation) => void;
  removeInvitation: (invitationId: string) => void;
  reset: () => void;
}

interface SpaceStore extends SpaceState {
  actions: SpaceActions;
}

const initialState: SpaceState = {
  spaces: [],
  currentSpace: null,
  members: [],
  invitations: [],
  isLoading: false,
  _hasHydrated: false,
};

const useSpaceStore = create<SpaceStore>()(
  persist(
    (set) => ({
      ...initialState,

      actions: {
        setSpaces: (spaces) => set({ spaces }),
        setCurrentSpace: (space) => set({ currentSpace: space }),
        setMembers: (members) => set({ members }),
        setInvitations: (invitations) => set({ invitations }),
        setLoading: (loading) => set({ isLoading: loading }),

        addSpace: (space) =>
          set((state) => ({ spaces: [...state.spaces, space] })),

        updateSpace: (spaceId, data) =>
          set((state) => ({
            spaces: state.spaces.map((s) =>
              s.id === spaceId ? { ...s, ...data } : s
            ),
            currentSpace:
              state.currentSpace?.id === spaceId
                ? { ...state.currentSpace, ...data }
                : state.currentSpace,
          })),

        removeSpace: (spaceId) =>
          set((state) => ({
            spaces: state.spaces.filter((s) => s.id !== spaceId),
            currentSpace:
              state.currentSpace?.id === spaceId ? null : state.currentSpace,
          })),

        addMember: (member) =>
          set((state) => ({ members: [...state.members, member] })),

        updateMember: (memberId, data) =>
          set((state) => ({
            members: state.members.map((m) =>
              m.id === memberId ? { ...m, ...data } : m
            ),
          })),

        removeMember: (memberId) =>
          set((state) => ({
            members: state.members.filter((m) => m.id !== memberId),
          })),

        addInvitation: (invitation) =>
          set((state) => ({
            invitations: [...state.invitations, invitation],
          })),

        removeInvitation: (invitationId) =>
          set((state) => ({
            invitations: state.invitations.filter((i) => i.id !== invitationId),
          })),

        reset: () => set(initialState),
      },
    }),
    {
      name: "dailyos-space",
      partialize: (state) => ({
        currentSpace: state.currentSpace,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<SpaceStore>),
        actions: currentState.actions,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
    }
  )
);

// Individual hook exports
export const useSpaces = () =>
  useSpaceStore(useShallow((state) => state.spaces));
export const useCurrentSpace = () =>
  useSpaceStore((state) => state.currentSpace);
export const useSpaceMembers = () =>
  useSpaceStore(useShallow((state) => state.members));
export const useSpaceInvitations = () =>
  useSpaceStore(useShallow((state) => state.invitations));
export const useSpaceLoading = () =>
  useSpaceStore((state) => state.isLoading);
export const useSpaceActions = () =>
  useSpaceStore((state) => state.actions);
export const useHasHydrated = () =>
  useSpaceStore((state) => state._hasHydrated);

// Computed selectors
export const useActiveMembers = () =>
  useSpaceStore(
    useShallow((state) => state.members.filter((m) => m.status === "active"))
  );

export const usePendingInvitations = () =>
  useSpaceStore(
    useShallow((state) =>
      state.invitations.filter((inv) => new Date(inv.expiresAt) > new Date())
    )
  );

export const useSpaceMode = () =>
  useSpaceStore((state) => state.currentSpace?.mode ?? "commerce");

// Get current user's membership in current space
export const useCurrentMembership = (userId: string | undefined) =>
  useSpaceStore((state) =>
    userId ? state.members.find((m) => m.userId === userId) : undefined
  );

// ============================================
// Compatibility exports (alias old names)
// These map old account-store names to new space-store names
// ============================================

// Alias for backwards compatibility
export const useAccountInvitations = useSpaceInvitations;
export const useCurrentAccount = useCurrentSpace;
export const useAccountUsers = useSpaceMembers;

// Placeholder hooks for system pages (need API implementation)
export const useAuditLog = () => [] as {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  timestamp: string;
}[];

export const useIsAccountInitialized = () => true;

export const useAccounts = () => useSpaceStore(useShallow((state) => state.spaces));

export const useAccountActions = () => {
  const spaceActions = useSpaceActions();
  return {
    ...spaceActions,
    // Map old action names to new ones
    initializeAccount: () => {},
    switchAccount: spaceActions.setCurrentSpace,
    createAccount: spaceActions.addSpace,
    updateAccountName: (id: string, name: string) => spaceActions.updateSpace(id, { name }),
    updateAccountMode: (id: string, mode: SpaceMode) => spaceActions.updateSpace(id, { mode }),
    addUser: spaceActions.addMember,
    updateUser: spaceActions.updateMember,
    suspendUser: (id: string) => spaceActions.updateMember(id, { status: "suspended" }),
    removeUser: spaceActions.removeMember,
    createInvitation: spaceActions.addInvitation,
    revokeInvitation: spaceActions.removeInvitation,
    addAuditEntry: () => {},
  };
};
