// Module identifiers
export type ModuleId = "commerce" | "finance" | "mealflow" | "system";

// Account modes - gates module availability
export type AccountMode = "internal" | "commerce";

// Role identifiers
export type RoleId =
  | "owner"
  | "admin"
  | "commerce_manager"
  | "fintrack_manager"
  | "mealflow_manager"
  | "cashier"
  | "viewer";

// Capabilities define what actions can be performed within modules
export type Capability =
  // Commerce capabilities
  | "view_products"
  | "edit_products"
  | "publish_storefront"
  | "view_inventory"
  | "adjust_inventory"
  | "view_orders"
  | "edit_orders"
  | "refund_order"
  | "create_pos_sale"
  | "view_customers"
  | "edit_customers"
  | "view_reports"
  // Finance capabilities
  | "view_finances"
  | "edit_finances"
  | "export_finances"
  | "manage_budget"
  | "manage_goals"
  | "manage_costs"
  // MealFlow capabilities
  | "view_meals"
  | "edit_meals"
  | "manage_groceries"
  | "view_recipes"
  | "edit_recipes"
  // System capabilities
  | "view_users"
  | "manage_users"
  | "invite_users"
  | "manage_roles"
  | "view_audit_log"
  | "manage_account_settings";

// User status
export type UserStatus = "active" | "invited" | "suspended";

// Role definition
export interface Role {
  id: RoleId;
  name: string;
  description: string;
  modules: ModuleId[];
  capabilities: Capability[];
  isSystem: boolean; // Cannot be edited/deleted
}

// Account definition
export interface Account {
  id: string;
  name: string;
  mode: AccountMode;
  createdAt: string;
  updatedAt: string;
}

// Extended User type for permission system
export interface PermissionUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  accountId: string;
  roleId: RoleId;
  status: UserStatus;
  invitedBy?: string;
  invitedAt?: string;
  lastActiveAt?: string;
  createdAt: string;
}

// User invitation
export interface UserInvitation {
  id: string;
  email: string;
  roleId: RoleId;
  accountId: string;
  invitedBy: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
}

// Audit log entry
export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: string;
  timestamp: string;
}

export type AuditAction =
  | "user_invited"
  | "user_role_changed"
  | "user_suspended"
  | "user_activated"
  | "user_removed"
  | "invitation_revoked"
  | "account_mode_changed"
  | "account_settings_updated"
  | "login"
  | "logout";

// All capabilities grouped by module
export const MODULE_CAPABILITIES: Record<ModuleId, Capability[]> = {
  commerce: [
    "view_products",
    "edit_products",
    "publish_storefront",
    "view_inventory",
    "adjust_inventory",
    "view_orders",
    "edit_orders",
    "refund_order",
    "create_pos_sale",
    "view_customers",
    "edit_customers",
    "view_reports",
  ],
  finance: [
    "view_finances",
    "edit_finances",
    "export_finances",
    "manage_budget",
    "manage_goals",
    "manage_costs",
  ],
  mealflow: [
    "view_meals",
    "edit_meals",
    "manage_groceries",
    "view_recipes",
    "edit_recipes",
  ],
  system: [
    "view_users",
    "manage_users",
    "invite_users",
    "manage_roles",
    "view_audit_log",
    "manage_account_settings",
  ],
};

// All capabilities combined
const ALL_CAPABILITIES: Capability[] = Object.values(MODULE_CAPABILITIES).flat();

// Predefined roles configuration
export const PREDEFINED_ROLES: Record<RoleId, Role> = {
  owner: {
    id: "owner",
    name: "Owner",
    description: "Full access to all modules and capabilities",
    modules: ["commerce", "finance", "mealflow", "system"],
    capabilities: ALL_CAPABILITIES,
    isSystem: true,
  },
  admin: {
    id: "admin",
    name: "Admin",
    description: "All modules except system administration",
    modules: ["commerce", "finance", "mealflow"],
    capabilities: [
      // Commerce - all except some destructive actions
      "view_products",
      "edit_products",
      "publish_storefront",
      "view_inventory",
      "adjust_inventory",
      "view_orders",
      "edit_orders",
      "refund_order",
      "create_pos_sale",
      "view_customers",
      "edit_customers",
      "view_reports",
      // Finance - view only
      "view_finances",
      // MealFlow - edit access
      "view_meals",
      "edit_meals",
      "manage_groceries",
      "view_recipes",
      "edit_recipes",
    ],
    isSystem: true,
  },
  commerce_manager: {
    id: "commerce_manager",
    name: "Commerce Manager",
    description: "Manage products, inventory, and storefront",
    modules: ["commerce"],
    capabilities: [
      "view_products",
      "edit_products",
      "publish_storefront",
      "view_inventory",
      // No adjust_inventory
      "view_orders",
      "edit_orders",
      // No refund_order
      // No create_pos_sale
      "view_customers",
      "edit_customers",
      "view_reports",
    ],
    isSystem: true,
  },
  fintrack_manager: {
    id: "fintrack_manager",
    name: "FinTrack Manager",
    description: "View and export financial data",
    modules: ["finance"],
    capabilities: [
      "view_finances",
      "edit_finances",
      "export_finances",
      "manage_budget",
      "manage_goals",
      "manage_costs",
    ],
    isSystem: true,
  },
  mealflow_manager: {
    id: "mealflow_manager",
    name: "MealFlow Manager",
    description: "Manage meals, recipes, and groceries",
    modules: ["mealflow"],
    capabilities: [
      "view_meals",
      "edit_meals",
      "manage_groceries",
      "view_recipes",
      "edit_recipes",
    ],
    isSystem: true,
  },
  cashier: {
    id: "cashier",
    name: "Cashier",
    description: "POS sales and order viewing only",
    modules: ["commerce"],
    capabilities: [
      "view_products",
      "view_inventory",
      "view_orders",
      "create_pos_sale",
      "view_customers",
      // No edit capabilities
      // No refund capability
    ],
    isSystem: true,
  },
  viewer: {
    id: "viewer",
    name: "Viewer",
    description: "Read-only access to all modules",
    modules: ["commerce", "finance", "mealflow"],
    capabilities: [
      "view_products",
      "view_inventory",
      "view_orders",
      "view_customers",
      "view_reports",
      "view_finances",
      "view_meals",
      "view_recipes",
    ],
    isSystem: true,
  },
};

// Helper to get role by ID
export function getRole(roleId: RoleId): Role {
  return PREDEFINED_ROLES[roleId];
}

// Helper to get all roles as array
export function getAllRoles(): Role[] {
  return Object.values(PREDEFINED_ROLES);
}

// Helper to get roles that can be assigned (excludes owner for non-owners)
export function getAssignableRoles(currentUserRole: RoleId): Role[] {
  const allRoles = getAllRoles();
  if (currentUserRole === "owner") {
    return allRoles;
  }
  // Non-owners cannot assign owner role
  return allRoles.filter((role) => role.id !== "owner");
}
