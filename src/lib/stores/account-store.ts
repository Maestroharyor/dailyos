import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type {
  Account,
  AccountMode,
  PermissionUser,
  UserInvitation,
  AuditLogEntry,
  RoleId,
  AuditAction,
} from "@/lib/types/permissions";

// Generate unique IDs
const generateId = () => crypto.randomUUID();

// Default account for new users
const createDefaultAccount = (): Account => ({
  id: generateId(),
  name: "My Team",
  mode: "commerce",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Mock users for testing different roles
const createMockUsers = (accountId: string, ownerId: string): PermissionUser[] => [
  {
    id: "user-admin",
    name: "Alex Admin",
    email: "admin@example.com",
    avatar: "https://i.pravatar.cc/150?u=admin@example.com",
    accountId,
    roleId: "admin",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-commerce",
    name: "Sarah Commerce",
    email: "commerce@example.com",
    avatar: "https://i.pravatar.cc/150?u=commerce@example.com",
    accountId,
    roleId: "commerce_manager",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-cashier",
    name: "Mike Cashier",
    email: "cashier@example.com",
    avatar: "https://i.pravatar.cc/150?u=cashier@example.com",
    accountId,
    roleId: "cashier",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-finance",
    name: "Lisa Finance",
    email: "finance@example.com",
    avatar: "https://i.pravatar.cc/150?u=finance@example.com",
    accountId,
    roleId: "fintrack_manager",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-mealflow",
    name: "Tom MealFlow",
    email: "meals@example.com",
    avatar: "https://i.pravatar.cc/150?u=meals@example.com",
    accountId,
    roleId: "mealflow_manager",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-viewer",
    name: "View Only",
    email: "viewer@example.com",
    avatar: "https://i.pravatar.cc/150?u=viewer@example.com",
    accountId,
    roleId: "viewer",
    status: "active",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "user-suspended",
    name: "Suspended User",
    email: "suspended@example.com",
    avatar: "https://i.pravatar.cc/150?u=suspended@example.com",
    accountId,
    roleId: "viewer",
    status: "suspended",
    invitedBy: ownerId,
    invitedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Mock invitations
const createMockInvitations = (accountId: string, invitedById: string): UserInvitation[] => [
  {
    id: "inv-1",
    email: "newuser@example.com",
    roleId: "viewer",
    accountId,
    invitedBy: invitedById,
    invitedByName: "Account Owner",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "inv-2",
    email: "manager@example.com",
    roleId: "commerce_manager",
    accountId,
    invitedBy: invitedById,
    invitedByName: "Account Owner",
    expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Mock audit log entries
const createMockAuditLog = (accountId: string, ownerId: string): AuditLogEntry[] => [
  {
    id: "audit-1",
    userId: ownerId,
    userName: "Account Owner",
    action: "user_invited",
    resource: "user",
    resourceId: "inv-1",
    details: "Invited newuser@example.com as Viewer",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "audit-2",
    userId: ownerId,
    userName: "Account Owner",
    action: "user_role_changed",
    resource: "user",
    resourceId: "user-commerce",
    details: "Changed role from Viewer to Commerce Manager",
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "audit-3",
    userId: ownerId,
    userName: "Account Owner",
    action: "user_suspended",
    resource: "user",
    resourceId: "user-suspended",
    details: "Suspended user for policy violation",
    timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "audit-4",
    userId: ownerId,
    userName: "Account Owner",
    action: "account_mode_changed",
    resource: "account",
    resourceId: accountId,
    details: "Changed account mode from internal to commerce",
    timestamp: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

interface AccountState {
  accounts: Account[];
  currentAccountId: string | null;
  currentAccount: Account | null;
  users: PermissionUser[];
  invitations: UserInvitation[];
  auditLog: AuditLogEntry[];
  isInitialized: boolean;
}

interface AccountActions {
  initializeAccount: (ownerId: string, ownerName: string, ownerEmail: string) => void;
  setAccount: (account: Account) => void;
  switchAccount: (accountId: string) => void;
  createAccount: (name: string, ownerId: string, ownerName: string, ownerEmail: string) => string;
  updateAccountName: (name: string) => void;
  updateAccountMode: (mode: AccountMode) => void;
  addUser: (user: Omit<PermissionUser, "id" | "createdAt">) => string;
  updateUser: (id: string, data: Partial<PermissionUser>) => void;
  updateUserRole: (id: string, roleId: RoleId) => void;
  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;
  removeUser: (id: string) => void;
  createInvitation: (
    email: string,
    roleId: RoleId,
    invitedBy: string,
    invitedByName: string
  ) => string;
  revokeInvitation: (id: string) => void;
  addAuditEntry: (
    userId: string,
    userName: string,
    action: AuditAction,
    resource: string,
    resourceId?: string,
    details?: string
  ) => void;
  getUserById: (id: string) => PermissionUser | undefined;
}

interface AccountStore extends AccountState {
  actions: AccountActions;
}

const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      accounts: [],
      currentAccountId: null,
      currentAccount: null,
      users: [],
      invitations: [],
      auditLog: [],
      isInitialized: false,

      actions: {
        initializeAccount: (ownerId, ownerName, ownerEmail) => {
          const state = get();
          if (state.isInitialized) return;

          const account = createDefaultAccount();
          const mockUsers = createMockUsers(account.id, ownerId);
          const mockInvitations = createMockInvitations(account.id, ownerId);
          const mockAuditLog = createMockAuditLog(account.id, ownerId);

          // Add the owner as the first user
          const ownerUser: PermissionUser = {
            id: ownerId,
            name: ownerName,
            email: ownerEmail,
            avatar: `https://i.pravatar.cc/150?u=${ownerEmail}`,
            accountId: account.id,
            roleId: "owner",
            status: "active",
            createdAt: account.createdAt,
            lastActiveAt: new Date().toISOString(),
          };

          // Create a second demo account
          const secondAccount: Account = {
            id: generateId(),
            name: "Acme Team",
            mode: "commerce",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          // Owner user for second account
          const secondAccountOwner: PermissionUser = {
            id: ownerId,
            name: ownerName,
            email: ownerEmail,
            avatar: `https://i.pravatar.cc/150?u=${ownerEmail}`,
            accountId: secondAccount.id,
            roleId: "owner",
            status: "active",
            createdAt: secondAccount.createdAt,
            lastActiveAt: new Date().toISOString(),
          };

          set({
            accounts: [account, secondAccount],
            currentAccountId: account.id,
            currentAccount: account,
            users: [ownerUser, ...mockUsers, secondAccountOwner],
            invitations: mockInvitations,
            auditLog: mockAuditLog,
            isInitialized: true,
          });
        },

        setAccount: (account) => {
          set({ currentAccount: account, currentAccountId: account.id });
        },

        switchAccount: (accountId) => {
          const state = get();
          const account = state.accounts.find((a) => a.id === accountId);
          if (account) {
            set({ currentAccount: account, currentAccountId: accountId });
          }
        },

        createAccount: (name, ownerId, ownerName, ownerEmail) => {
          const id = generateId();
          const account: Account = {
            id,
            name,
            mode: "commerce",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const ownerUser: PermissionUser = {
            id: ownerId,
            name: ownerName,
            email: ownerEmail,
            avatar: `https://i.pravatar.cc/150?u=${ownerEmail}`,
            accountId: id,
            roleId: "owner",
            status: "active",
            createdAt: account.createdAt,
            lastActiveAt: new Date().toISOString(),
          };

          set((state) => ({
            accounts: [...state.accounts, account],
            users: [...state.users, ownerUser],
            currentAccount: account,
            currentAccountId: id,
          }));

          return id;
        },

        updateAccountName: (name) => {
          set((state) => {
            const updatedAccount = state.currentAccount
              ? { ...state.currentAccount, name, updatedAt: new Date().toISOString() }
              : null;
            return {
              currentAccount: updatedAccount,
              accounts: state.accounts.map((a) =>
                a.id === state.currentAccountId ? { ...a, name, updatedAt: new Date().toISOString() } : a
              ),
            };
          });
        },

        updateAccountMode: (mode) => {
          set((state) => {
            const updatedAccount = state.currentAccount
              ? { ...state.currentAccount, mode, updatedAt: new Date().toISOString() }
              : null;
            return {
              currentAccount: updatedAccount,
              accounts: state.accounts.map((a) =>
                a.id === state.currentAccountId ? { ...a, mode, updatedAt: new Date().toISOString() } : a
              ),
            };
          });
        },

        addUser: (userData) => {
          const id = generateId();
          const user: PermissionUser = {
            ...userData,
            id,
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            users: [...state.users, user],
          }));
          return id;
        },

        updateUser: (id, data) => {
          set((state) => ({
            users: state.users.map((user) =>
              user.id === id ? { ...user, ...data } : user
            ),
          }));
        },

        updateUserRole: (id, roleId) => {
          set((state) => ({
            users: state.users.map((user) =>
              user.id === id ? { ...user, roleId } : user
            ),
          }));
        },

        suspendUser: (id) => {
          set((state) => ({
            users: state.users.map((user) =>
              user.id === id ? { ...user, status: "suspended" } : user
            ),
          }));
        },

        activateUser: (id) => {
          set((state) => ({
            users: state.users.map((user) =>
              user.id === id ? { ...user, status: "active" } : user
            ),
          }));
        },

        removeUser: (id) => {
          set((state) => ({
            users: state.users.filter((user) => user.id !== id),
          }));
        },

        createInvitation: (email, roleId, invitedBy, invitedByName) => {
          const state = get();
          const id = generateId();
          const invitation: UserInvitation = {
            id,
            email,
            roleId,
            accountId: state.currentAccount?.id || "",
            invitedBy,
            invitedByName,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
          };
          set((state) => ({
            invitations: [...state.invitations, invitation],
          }));
          return id;
        },

        revokeInvitation: (id) => {
          set((state) => ({
            invitations: state.invitations.filter((inv) => inv.id !== id),
          }));
        },

        addAuditEntry: (userId, userName, action, resource, resourceId, details) => {
          const entry: AuditLogEntry = {
            id: generateId(),
            userId,
            userName,
            action,
            resource,
            resourceId,
            details,
            timestamp: new Date().toISOString(),
          };
          set((state) => ({
            auditLog: [entry, ...state.auditLog].slice(0, 100), // Keep last 100 entries
          }));
        },

        getUserById: (id) => {
          return get().users.find((user) => user.id === id);
        },
      },
    }),
    {
      name: "dailyos-account",
      partialize: (state) => ({
        accounts: state.accounts,
        currentAccountId: state.currentAccountId,
        currentAccount: state.currentAccount,
        users: state.users,
        invitations: state.invitations,
        auditLog: state.auditLog,
        isInitialized: state.isInitialized,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<AccountStore>),
        actions: currentState.actions,
      }),
    }
  )
);

// Individual hook exports (following CLAUDE.md patterns)
export const useAccounts = () =>
  useAccountStore(useShallow((state) => state.accounts));
export const useCurrentAccountId = () =>
  useAccountStore((state) => state.currentAccountId);
export const useCurrentAccount = () =>
  useAccountStore((state) => state.currentAccount);
export const useAccountMode = () =>
  useAccountStore((state) => state.currentAccount?.mode ?? "commerce");
export const useAccountUsers = () =>
  useAccountStore(useShallow((state) => state.users));
export const useAccountInvitations = () =>
  useAccountStore(useShallow((state) => state.invitations));
export const useAuditLog = () =>
  useAccountStore(useShallow((state) => state.auditLog));
export const useIsAccountInitialized = () =>
  useAccountStore((state) => state.isInitialized);
export const useAccountActions = () =>
  useAccountStore((state) => state.actions);

// Computed selectors
export const useActiveUsers = () =>
  useAccountStore(
    useShallow((state) => state.users.filter((u) => u.status === "active"))
  );

export const usePendingInvitations = () =>
  useAccountStore(
    useShallow((state) =>
      state.invitations.filter(
        (inv) => new Date(inv.expiresAt) > new Date()
      )
    )
  );

export const useUserById = (id: string) =>
  useAccountStore((state) => state.users.find((u) => u.id === id));
