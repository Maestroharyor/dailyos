"use client";

import { useMemo } from "react";
import { useEffectiveRole } from "@/lib/stores/auth-store";
import { useAccountMode } from "@/lib/stores/account-store";
import type { ModuleId, Capability } from "@/lib/types/permissions";
import {
  canAccessModule,
  hasCapability,
  isCapabilityAvailable,
  getAccessibleModules,
  canUsePOS,
  canUseStorefront,
  canAccessRoute,
} from "@/lib/utils/permissions";

/**
 * Hook to check if user can access a specific module
 */
export function useModuleAccess(moduleId: ModuleId): boolean {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return canAccessModule(effectiveRole, accountMode, moduleId);
  }, [effectiveRole, accountMode, moduleId]);
}

/**
 * Hook to check if user has a specific capability (ignores account mode)
 */
export function useCapability(capability: Capability): boolean {
  const effectiveRole = useEffectiveRole();

  return useMemo(() => {
    return hasCapability(effectiveRole, capability);
  }, [effectiveRole, capability]);
}

/**
 * Hook to check if a capability is available (considers account mode)
 */
export function useCapabilityAvailable(capability: Capability): boolean {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return isCapabilityAvailable(effectiveRole, accountMode, capability);
  }, [effectiveRole, accountMode, capability]);
}

/**
 * Hook to get list of accessible modules
 */
export function useAccessibleModules(): ModuleId[] {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return getAccessibleModules(effectiveRole, accountMode);
  }, [effectiveRole, accountMode]);
}

/**
 * Hook to check if POS is available
 */
export function useCanUsePOS(): boolean {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return canUsePOS(effectiveRole, accountMode);
  }, [effectiveRole, accountMode]);
}

/**
 * Hook to check if Storefront is available
 */
export function useCanUseStorefront(): boolean {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return canUseStorefront(effectiveRole, accountMode);
  }, [effectiveRole, accountMode]);
}

/**
 * Hook to check if a route is accessible
 */
export function useRouteAccess(pathname: string): boolean {
  const effectiveRole = useEffectiveRole();
  const accountMode = useAccountMode();

  return useMemo(() => {
    return canAccessRoute(effectiveRole, accountMode, pathname);
  }, [effectiveRole, accountMode, pathname]);
}

/**
 * Hook to check multiple capabilities at once
 */
export function useCapabilities(capabilities: Capability[]): Record<Capability, boolean> {
  const effectiveRole = useEffectiveRole();

  return useMemo(() => {
    return capabilities.reduce(
      (acc, cap) => {
        acc[cap] = hasCapability(effectiveRole, cap);
        return acc;
      },
      {} as Record<Capability, boolean>
    );
  }, [effectiveRole, capabilities]);
}

/**
 * Hook to check if user can edit (has any edit capability for a module)
 */
export function useCanEdit(moduleId: ModuleId): boolean {
  const effectiveRole = useEffectiveRole();

  return useMemo(() => {
    const editCapabilities: Record<ModuleId, Capability[]> = {
      commerce: ["edit_products", "edit_orders", "edit_customers", "adjust_inventory"],
      finance: ["edit_finances", "manage_budget", "manage_goals"],
      mealflow: ["edit_meals", "edit_recipes", "manage_groceries"],
      system: ["manage_users", "manage_account_settings"],
    };

    const caps = editCapabilities[moduleId] || [];
    return caps.some((cap) => hasCapability(effectiveRole, cap));
  }, [effectiveRole, moduleId]);
}
