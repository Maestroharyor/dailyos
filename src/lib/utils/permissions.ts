import type {
  ModuleId,
  Capability,
  RoleId,
  AccountMode,
} from "@/lib/types/permissions";
import { PREDEFINED_ROLES } from "@/lib/types/permissions";

/**
 * Get modules accessible based on role and account mode
 */
export function getAccessibleModules(
  roleId: RoleId,
  accountMode: AccountMode
): ModuleId[] {
  const role = PREDEFINED_ROLES[roleId];
  if (!role) return [];

  const modules = [...role.modules];

  // Account mode restrictions don't affect which modules are shown,
  // they affect which features within modules are available
  // All role-allowed modules remain accessible
  return modules;
}

/**
 * Check if a role can access a specific module
 */
export function canAccessModule(
  roleId: RoleId,
  accountMode: AccountMode,
  moduleId: ModuleId
): boolean {
  const accessibleModules = getAccessibleModules(roleId, accountMode);
  return accessibleModules.includes(moduleId);
}

/**
 * Check if a role has a specific capability
 */
export function hasCapability(roleId: RoleId, capability: Capability): boolean {
  const role = PREDEFINED_ROLES[roleId];
  return role?.capabilities.includes(capability) ?? false;
}

/**
 * Check if a capability is available considering both role and account mode
 */
export function isCapabilityAvailable(
  roleId: RoleId,
  accountMode: AccountMode,
  capability: Capability
): boolean {
  // First check if role has the capability
  if (!hasCapability(roleId, capability)) {
    return false;
  }

  // Account mode restrictions for specific commerce features
  if (accountMode === "internal") {
    const blockedCapabilities: Capability[] = [
      "create_pos_sale",
      "publish_storefront",
    ];
    if (blockedCapabilities.includes(capability)) {
      return false;
    }
  }

  return true;
}

/**
 * Get all capabilities for a role
 */
export function getRoleCapabilities(roleId: RoleId): Capability[] {
  return PREDEFINED_ROLES[roleId]?.capabilities ?? [];
}

/**
 * Get capabilities available for a role considering account mode
 */
export function getAvailableCapabilities(
  roleId: RoleId,
  accountMode: AccountMode
): Capability[] {
  const capabilities = getRoleCapabilities(roleId);

  if (accountMode === "internal") {
    const blockedCapabilities: Capability[] = [
      "create_pos_sale",
      "publish_storefront",
    ];
    return capabilities.filter((cap) => !blockedCapabilities.includes(cap));
  }

  return capabilities;
}

/**
 * Map routes to modules
 */
const ROUTE_MODULE_MAP: Record<string, ModuleId> = {
  "/commerce": "commerce",
  "/finance": "finance",
  "/mealflow": "mealflow",
  "/system": "system",
};

/**
 * Get the module for a given route path
 */
export function getModuleForRoute(pathname: string): ModuleId | null {
  const entry = Object.entries(ROUTE_MODULE_MAP).find(([route]) =>
    pathname.startsWith(route)
  );
  return entry ? entry[1] : null;
}

/**
 * Check if a route is accessible based on role and account mode
 */
export function canAccessRoute(
  roleId: RoleId,
  accountMode: AccountMode,
  pathname: string
): boolean {
  const moduleId = getModuleForRoute(pathname);

  // Non-module routes (home, settings) are always accessible
  if (!moduleId) return true;

  return canAccessModule(roleId, accountMode, moduleId);
}

/**
 * Check if POS is available (role has capability + account mode allows it)
 */
export function canUsePOS(roleId: RoleId, accountMode: AccountMode): boolean {
  return isCapabilityAvailable(roleId, accountMode, "create_pos_sale");
}

/**
 * Check if Storefront is available (role has capability + account mode allows it)
 */
export function canUseStorefront(
  roleId: RoleId,
  accountMode: AccountMode
): boolean {
  return isCapabilityAvailable(roleId, accountMode, "publish_storefront");
}

/**
 * Get the display name for a role
 */
export function getRoleName(roleId: RoleId): string {
  return PREDEFINED_ROLES[roleId]?.name ?? roleId;
}

/**
 * Get the description for a role
 */
export function getRoleDescription(roleId: RoleId): string {
  return PREDEFINED_ROLES[roleId]?.description ?? "";
}

/**
 * Check if a user can manage another user's role
 * Only owners can change roles to/from owner
 * Admins can change roles but not to owner
 */
export function canManageUserRole(
  currentUserRole: RoleId,
  targetUserRole: RoleId,
  newRole: RoleId
): boolean {
  // Only owners can manage other owners or assign owner role
  if (targetUserRole === "owner" || newRole === "owner") {
    return currentUserRole === "owner";
  }

  // Owners and admins can manage other roles
  return currentUserRole === "owner" || currentUserRole === "admin";
}

/**
 * Check if a user can remove another user
 * Only owners can remove users
 */
export function canRemoveUser(currentUserRole: RoleId): boolean {
  return currentUserRole === "owner";
}

/**
 * Check if a user can invite new users
 */
export function canInviteUsers(roleId: RoleId): boolean {
  return hasCapability(roleId, "invite_users");
}
