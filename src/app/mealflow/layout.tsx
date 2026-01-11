"use client";

import { LayoutDashboard, CalendarDays, BookOpen, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { BottomNav } from "@/components/shared/bottom-nav";
import { Dock } from "@/components/shared/dock";
import { SubAppHeader } from "@/components/shared/sub-app-header";

const navItems = [
  { href: "/mealflow", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/mealflow/meals", label: "Meals", icon: CalendarDays },
  { href: "/mealflow/recipes", label: "Recipes", icon: BookOpen },
  { href: "/mealflow/groceries", label: "Groceries", icon: ShoppingCart },
];

export default function MealflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <SubAppHeader
          appId="mealflow"
          appIcon={UtensilsCrossed}
          appColor="linear-gradient(135deg, #10b981, #059669)"
          navItems={navItems}
          basePath="/mealflow"
        />
        <main className="has-bottom-nav">{children}</main>
        <Dock autoHide />
        <BottomNav variant="mealflow" />
      </div>
    </AuthGuard>
  );
}
