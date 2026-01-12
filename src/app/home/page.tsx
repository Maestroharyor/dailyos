"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Wallet,
  UtensilsCrossed,
  ChevronRight,
  ShoppingCart,
  Shield,
} from "lucide-react";
import { Dock } from "@/components/shared/dock";
import { RoleSwitcher } from "@/components/shared/role-switcher";
import { useAppsView } from "@/lib/stores";
import { useAccessibleModules } from "@/lib/hooks/use-permissions";
import { config } from "@/lib/config";
import type { ModuleId } from "@/lib/types/permissions";

interface AppConfig {
  id: string;
  moduleId: ModuleId;
  name: string;
  description: string;
  href: string;
  gradient: string;
  icon: React.ElementType;
  buttonColor: string;
  buttonBg: string;
  comingSoon?: boolean;
}

const allApps: AppConfig[] = [
  {
    id: "fintrack",
    moduleId: "finance",
    name: "Fintrack",
    description: "Track your expenses",
    href: "/finance",
    gradient: "from-blue-500 to-blue-600",
    icon: Wallet,
    buttonColor: "text-blue-600",
    buttonBg: "bg-white/90 hover:bg-white",
  },
  {
    id: "mealflow",
    moduleId: "mealflow",
    name: "Mealflow",
    description: "Plan your meals",
    href: "/mealflow",
    gradient: "from-emerald-500 to-green-600",
    icon: UtensilsCrossed,
    buttonColor: "text-emerald-600",
    buttonBg: "bg-white/90 hover:bg-white",
  },
  {
    id: "commerce",
    moduleId: "commerce",
    name: "Commerce",
    description: "Track your shopping",
    href: "/commerce",
    gradient: "from-purple-500 to-violet-600",
    icon: ShoppingCart,
    buttonColor: "text-purple-600",
    buttonBg: "bg-white/90 hover:bg-white",
  },
  {
    id: "system",
    moduleId: "system",
    name: "System",
    description: "Manage users & settings",
    href: "/system",
    gradient: "from-indigo-500 to-violet-600",
    icon: Shield,
    buttonColor: "text-indigo-600",
    buttonBg: "bg-white/90 hover:bg-white",
  },
];


export default function Dashboard() {
  const appsView = useAppsView();
  const accessibleModules = useAccessibleModules();

  // Filter apps based on accessible modules
  const apps = useMemo(() => {
    return allApps.filter((app) =>
      accessibleModules.includes(app.moduleId)
    );
  }, [accessibleModules]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-100 via-blue-50/30 to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      {/* Decorative background waves */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg
          className="absolute top-0 right-0 w-full h-full opacity-30 dark:opacity-10"
          viewBox="0 0 1200 800"
          preserveAspectRatio="none"
        >
          <path
            d="M0,200 Q300,100 600,200 T1200,200 L1200,0 L0,0 Z"
            fill="rgba(191, 219, 254, 0.3)"
          />
          <path
            d="M0,600 Q400,500 800,600 T1200,550 L1200,800 L0,800 Z"
            fill="rgba(191, 219, 254, 0.2)"
          />
        </svg>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Welcome Section */}
        <div className="text-center mb-6 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
            Welcome to {config.appName}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-lg">
            Manage your life in one place.
          </p>
        </div>

        {/* App Cards or OS Icons based on appsView */}
        {appsView === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {apps.map((app) => (
              <div
                key={app.id}
                className={`relative rounded-2xl sm:rounded-3xl overflow-hidden bg-gradient-to-br ${app.gradient} p-4 sm:p-6 min-h-[200px] sm:min-h-[280px] md:min-h-[320px] flex flex-col shadow-xl`}
              >
                {/* Coming Soon Badge */}
                {app.comingSoon && (
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                    <span className="px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium bg-white/90 text-gray-700 rounded-full shadow-sm">
                      Coming Soon
                    </span>
                  </div>
                )}

                {/* Icon */}
                <div className="mb-3 sm:mb-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <app.icon size={24} className="text-white sm:w-8 sm:h-8" />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-0.5 sm:mb-1">
                    {app.name}
                  </h2>
                  <p className="text-white/80 text-sm sm:text-base">{app.description}</p>
                </div>

                {/* Decorative Graphics - hidden on small screens */}
                <div className="absolute bottom-14 sm:bottom-16 right-3 sm:right-4 opacity-80 hidden sm:block">
                  {app.id === "fintrack" && (
                    <div className="flex items-end gap-2">
                      <div className="flex items-end gap-1">
                        <div className="w-3 sm:w-4 h-10 sm:h-12 bg-white/30 rounded-t" />
                        <div className="w-3 sm:w-4 h-16 sm:h-20 bg-white/40 rounded-t" />
                        <div className="w-3 sm:w-4 h-12 sm:h-16 bg-white/30 rounded-t" />
                        <div className="w-3 sm:w-4 h-20 sm:h-24 bg-white/50 rounded-t" />
                      </div>
                      <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full border-4 border-white/30 relative">
                        <div className="absolute inset-1 rounded-full bg-gradient-to-br from-orange-400/60 to-blue-400/60" />
                      </div>
                    </div>
                  )}
                  {app.id === "mealflow" && (
                    <div className="w-16 sm:w-24 h-16 sm:h-24 rounded-full bg-white/20 flex items-center justify-center">
                      <span className="text-3xl sm:text-4xl">🥗</span>
                    </div>
                  )}
                  {app.id === "system" && (
                    <div className="flex items-center gap-1 opacity-60">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/30 flex items-center justify-center">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/50" />
                      </div>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/30 flex items-center justify-center">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/50" />
                      </div>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/30 flex items-center justify-center">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/50" />
                      </div>
                    </div>
                  )}
                </div>

                {/* CTA Button */}
                <div className="mt-auto pt-3 sm:pt-4">
                  {app.comingSoon ? (
                    <button
                      disabled
                      className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-full bg-white/80 text-gray-500 text-sm sm:text-base font-medium cursor-not-allowed"
                    >
                      Coming Soon
                    </button>
                  ) : (
                    <Link href={app.href}>
                      <button
                        className={`w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-full ${app.buttonBg} ${app.buttonColor} text-sm sm:text-base font-medium flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl cursor-pointer`}
                      >
                        Go to {app.name}
                        <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                      </button>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* macOS Desktop Icons View */
          <div className="flex flex-wrap justify-center gap-6 sm:gap-10 mb-8 sm:mb-12 py-8">
            {apps.map((app) => (
              <div key={app.id} className="relative">
                {app.comingSoon ? (
                  <div className="flex flex-col items-center gap-2 opacity-60">
                    <div
                      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[22px] bg-gradient-to-br ${app.gradient} flex items-center justify-center shadow-lg`}
                    >
                      <app.icon size={32} className="text-white sm:w-10 sm:h-10" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center max-w-[80px]">
                      {app.name}
                    </span>
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[8px] sm:text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                      Soon
                    </span>
                  </div>
                ) : (
                  <Link href={app.href} className="flex flex-col items-center gap-2 group">
                    <div
                      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[22px] bg-gradient-to-br ${app.gradient} flex items-center justify-center shadow-lg transition-all duration-200 group-hover:scale-110 group-hover:shadow-xl group-active:scale-95`}
                    >
                      <app.icon size={32} className="text-white sm:w-10 sm:h-10" />
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-center max-w-[80px] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {app.name}
                    </span>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Spacer for bottom navigation */}
        <div className="pb-24 md:pb-0" />
      </div>

      {/* macOS-style Dock */}
      <Dock />

      {/* Dev Role Switcher */}
      <RoleSwitcher />
    </div>
  );
}
