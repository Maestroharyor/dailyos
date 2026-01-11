"use client";

import {
  LayoutDashboard,
  Users,
  UserPlus,
  FileText,
  Settings,
  Shield,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { PermissionGuard, AccessDenied } from "@/components/permission-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Dock } from "@/components/shared/dock";
import { SubAppHeader } from "@/components/shared/sub-app-header";
import { RoleSwitcher } from "@/components/shared/role-switcher";

const navItems = [
  { href: "/system", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/system/users", label: "Users", icon: Users },
  { href: "/system/invitations", label: "Invitations", icon: UserPlus },
  { href: "/system/audit", label: "Audit Log", icon: FileText },
  { href: "/system/settings", label: "Settings", icon: Settings },
];

export default function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PermissionGuard
        module="system"
        fallback={
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
            <AccessDenied message="You do not have permission to access the System module. Only account owners can manage users and settings." />
          </div>
        }
      >
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <SubAppHeader
            appId="system"
            appIcon={Shield}
            appColor="linear-gradient(135deg, #6366f1, #4f46e5)"
            navItems={navItems}
            basePath="/system"
          />
          <main className="has-bottom-nav">{children}</main>
          <Dock autoHide />
          <BottomNav variant="system" />
          <RoleSwitcher />
        </div>
      </PermissionGuard>
    </AuthGuard>
  );
}
