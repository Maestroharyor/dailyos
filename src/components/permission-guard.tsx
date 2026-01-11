"use client";

import { useModuleAccess, useCapabilityAvailable } from "@/lib/hooks/use-permissions";
import type { ModuleId, Capability } from "@/lib/types/permissions";
import { ShieldX } from "lucide-react";

interface PermissionGuardProps {
  children: React.ReactNode;
  module?: ModuleId;
  capability?: Capability;
  fallback?: React.ReactNode;
  showAccessDenied?: boolean;
}

/**
 * Permission guard component for conditional rendering based on permissions
 *
 * @example
 * // Guard by module access
 * <PermissionGuard module="commerce">
 *   <CommerceContent />
 * </PermissionGuard>
 *
 * @example
 * // Guard by capability
 * <PermissionGuard capability="edit_products">
 *   <EditButton />
 * </PermissionGuard>
 *
 * @example
 * // Guard by both
 * <PermissionGuard module="commerce" capability="refund_order" showAccessDenied>
 *   <RefundButton />
 * </PermissionGuard>
 */
export function PermissionGuard({
  children,
  module,
  capability,
  fallback = null,
  showAccessDenied = false,
}: PermissionGuardProps) {
  const hasModuleAccess = module ? useModuleAccess(module) : true;
  const hasCapabilityAccess = capability ? useCapabilityAvailable(capability) : true;

  if (!hasModuleAccess || !hasCapabilityAccess) {
    if (showAccessDenied) {
      return <AccessDenied />;
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Access denied component displayed when user lacks permissions
 */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ShieldX size={32} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
        <p className="text-gray-500 dark:text-gray-400 max-w-sm">
          {message || "You do not have permission to access this area. Contact your administrator for access."}
        </p>
      </div>
    </div>
  );
}

/**
 * Hook-based permission check for conditional rendering in components
 *
 * @example
 * function MyComponent() {
 *   const canEdit = useCapabilityAvailable("edit_products");
 *   return canEdit ? <EditButton /> : null;
 * }
 */
