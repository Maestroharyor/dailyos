"use client";

import {
  LayoutDashboard,
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Target,
  Repeat,
  Settings,
  Wallet,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { PermissionGuard, AccessDenied } from "@/components/permission-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Dock } from "@/components/shared/dock";
import { FloatingCalculator } from "@/components/shared/floating-calculator";
import { SubAppHeader } from "@/components/shared/sub-app-header";

const navItems = [
  { href: "/finance", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/finance/expenses", label: "Expenses", icon: ArrowDownCircle },
  { href: "/finance/income", label: "Income", icon: ArrowUpCircle },
  { href: "/finance/budget", label: "Budget", icon: PiggyBank },
  { href: "/finance/goals", label: "Goals", icon: Target },
  { href: "/finance/recurring", label: "Recurring", icon: Repeat },
  { href: "/finance/settings", label: "Settings", icon: Settings },
];

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PermissionGuard
        module="finance"
        fallback={
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
            <AccessDenied message="The Finance module is turned off for this space. An owner can enable it in Settings." />
          </div>
        }
      >
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <SubAppHeader
            appId="finance"
            appIcon={Wallet}
            appColor="linear-gradient(135deg, #3b82f6, #4f46e5)"
            navItems={navItems}
            basePath="/finance"
          />
          <main className="has-bottom-nav">{children}</main>
          <FloatingCalculator />
          <Dock autoHide />
          <BottomNav variant="finance" />
        </div>
      </PermissionGuard>
    </AuthGuard>
  );
}
