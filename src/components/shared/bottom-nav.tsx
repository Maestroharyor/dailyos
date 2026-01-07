"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Wallet, UtensilsCrossed, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
}

const mainNavItems: NavItem[] = [
  { href: "/home", icon: Home, label: "Home" },
  { href: "/finance", icon: Wallet, label: "Finance" },
  { href: "/mealflow", icon: UtensilsCrossed, label: "Meals" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface BottomNavProps {
  items?: NavItem[];
}

export function BottomNav({ items = mainNavItems }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[64px]",
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
                <span className={cn(
                  "text-[10px] font-medium",
                  isActive && "font-semibold"
                )}>
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

// Finance-specific bottom nav
export function FinanceBottomNav() {
  return <BottomNav items={mainNavItems} />;
}

// Mealflow-specific bottom nav
export function MealflowBottomNav() {
  return <BottomNav items={mainNavItems} />;
}
