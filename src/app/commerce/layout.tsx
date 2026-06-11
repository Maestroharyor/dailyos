"use client";

import {
  LayoutDashboard,
  Package,
  Warehouse,
  ShoppingCart,
  CreditCard,
  Users,
  BarChart3,
  Settings,
  Store,
  Ticket,
  Receipt,
  Tag,
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { PermissionGuard, AccessDenied } from "@/components/permission-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Dock } from "@/components/shared/dock";
import { FloatingCalculator } from "@/components/shared/floating-calculator";
import { SubAppHeader } from "@/components/shared/sub-app-header";

const navItems = [
  { href: "/commerce", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/commerce/pos", label: "POS", icon: CreditCard },
  { href: "/commerce/orders", label: "Orders", icon: ShoppingCart },
  { href: "/commerce/products", label: "Products", icon: Package },
  { href: "/commerce/inventory", label: "Inventory", icon: Warehouse },
  { href: "/commerce/customers", label: "Customers", icon: Users },
  { href: "/commerce/discounts", label: "Discounts", icon: Ticket },
  { href: "/commerce/sales", label: "Sales", icon: Tag },
  { href: "/commerce/expenses", label: "Expenses", icon: Receipt },
  { href: "/commerce/reports", label: "Reports", icon: BarChart3 },
  { href: "/commerce/settings", label: "Settings", icon: Settings },
];

export default function CommerceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <PermissionGuard
        module="commerce"
        fallback={
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
            <AccessDenied message="The Commerce module is turned off for this space. An owner can enable it in Settings." />
          </div>
        }
      >
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
          <SubAppHeader
            appId="commerce"
            appIcon={Store}
            appColor="linear-gradient(135deg, #f97316, #ea580c)"
            navItems={navItems}
            basePath="/commerce"
          />
          <main className="pb-24 md:pb-8">{children}</main>
          <FloatingCalculator />
          <Dock autoHide />
          <BottomNav variant="commerce" />
        </div>
      </PermissionGuard>
    </AuthGuard>
  );
}
