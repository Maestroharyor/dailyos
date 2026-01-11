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
} from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Dock } from "@/components/shared/dock";
import { FloatingCalculator } from "@/components/shared/floating-calculator";
import { SubAppHeader } from "@/components/shared/sub-app-header";

const navItems = [
  { href: "/commerce", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/commerce/products", label: "Products", icon: Package },
  { href: "/commerce/inventory", label: "Inventory", icon: Warehouse },
  { href: "/commerce/orders", label: "Orders", icon: ShoppingCart },
  { href: "/commerce/pos", label: "POS", icon: CreditCard },
  { href: "/commerce/customers", label: "Customers", icon: Users },
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
    </AuthGuard>
  );
}
