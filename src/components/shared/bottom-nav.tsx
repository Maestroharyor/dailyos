"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Wallet,
  UtensilsCrossed,
  Settings,
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  ShoppingCart,
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Target,
  Package,
  Warehouse,
  CreditCard,
  Store,
  Shield,
  Users,
  UserPlus,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccessibleModules } from "@/lib/hooks/use-permissions";
import type { ModuleId } from "@/lib/types/permissions";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  exact?: boolean;
  moduleId?: ModuleId; // For filtering main nav items
}

const mainNavItems: NavItem[] = [
  { href: "/home", icon: Home, label: "Home", exact: true },
  { href: "/finance", icon: Wallet, label: "Finance", moduleId: "finance" },
  { href: "/commerce", icon: Store, label: "Commerce", moduleId: "commerce" },
  { href: "/mealflow", icon: UtensilsCrossed, label: "Meals", moduleId: "mealflow" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

const mealflowNavItems: NavItem[] = [
  { href: "/mealflow", icon: LayoutDashboard, label: "Home", exact: true },
  { href: "/mealflow/meals", icon: CalendarDays, label: "Meals" },
  { href: "/mealflow/recipes", icon: BookOpen, label: "Recipes" },
  { href: "/mealflow/groceries", icon: ShoppingCart, label: "Groceries" },
];

const financeNavItems: NavItem[] = [
  { href: "/finance", icon: LayoutDashboard, label: "Home", exact: true },
  { href: "/finance/expenses", icon: ArrowDownCircle, label: "Expenses" },
  { href: "/finance/income", icon: ArrowUpCircle, label: "Income" },
  { href: "/finance/budget", icon: PiggyBank, label: "Budget" },
  { href: "/finance/goals", icon: Target, label: "Goals" },
];

const commerceNavItems: NavItem[] = [
  { href: "/commerce", icon: LayoutDashboard, label: "Home", exact: true },
  { href: "/commerce/products", icon: Package, label: "Products" },
  { href: "/commerce/inventory", icon: Warehouse, label: "Inventory" },
  { href: "/commerce/pos", icon: CreditCard, label: "POS" },
  { href: "/commerce/orders", icon: ShoppingCart, label: "Orders" },
];

const systemNavItems: NavItem[] = [
  { href: "/system", icon: LayoutDashboard, label: "Home", exact: true },
  { href: "/system/users", icon: Users, label: "Users" },
  { href: "/system/invitations", icon: UserPlus, label: "Invite" },
  { href: "/system/audit", icon: FileText, label: "Audit" },
  { href: "/system/settings", icon: Settings, label: "Settings" },
];

interface BottomNavProps {
  variant?: "main" | "mealflow" | "finance" | "commerce" | "system";
}

export function BottomNav({ variant = "main" }: BottomNavProps) {
  const pathname = usePathname();
  const accessibleModules = useAccessibleModules();

  // Get the base items for the variant
  const baseItems = useMemo(() => {
    switch (variant) {
      case "mealflow":
        return mealflowNavItems;
      case "finance":
        return financeNavItems;
      case "commerce":
        return commerceNavItems;
      case "system":
        return systemNavItems;
      default:
        return mainNavItems;
    }
  }, [variant]);

  // Filter main nav items based on accessible modules
  const items = useMemo(() => {
    if (variant !== "main") {
      return baseItems;
    }

    // For main nav, filter based on accessible modules
    return baseItems.filter((item) => {
      // Items without moduleId are always shown (Home, Settings)
      if (!item.moduleId) return true;
      return accessibleModules.includes(item.moduleId);
    });
  }, [variant, baseItems, accessibleModules]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {items.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[56px]",
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800"
                )}
              >
                <Icon
                  size={22}
                  className={cn(
                    "transition-transform",
                    isActive && "scale-110"
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isActive && "font-semibold"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
