"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip, Button } from "@heroui/react";
import {
  Home,
  Settings,
  Wallet,
  UtensilsCrossed,
  Store,
  PanelBottom,
  Shield,
} from "lucide-react";
import { useOpenApps, useAppPaths, useUIActions } from "@/lib/stores";
import { useAccessibleModules } from "@/lib/hooks/use-permissions";
import type { ModuleId } from "@/lib/types/permissions";

interface DockApp {
  id: string;
  moduleId: ModuleId;
  name: string;
  icon: React.ElementType;
  color: string;
  href: string;
}

const allApps: DockApp[] = [
  {
    id: "mealflow",
    moduleId: "mealflow",
    name: "Mealflow",
    icon: UtensilsCrossed,
    color: "linear-gradient(135deg, #10b981, #059669)",
    href: "/mealflow",
  },
  {
    id: "finance",
    moduleId: "finance",
    name: "Fintrack",
    icon: Wallet,
    color: "linear-gradient(135deg, #3b82f6, #4f46e5)",
    href: "/finance",
  },
  {
    id: "commerce",
    moduleId: "commerce",
    name: "Commerce",
    icon: Store,
    color: "linear-gradient(135deg, #f97316, #ea580c)",
    href: "/commerce",
  },
  {
    id: "system",
    moduleId: "system",
    name: "System",
    icon: Shield,
    color: "linear-gradient(135deg, #6366f1, #4f46e5)",
    href: "/system",
  },
];

interface DockProps {
  autoHide?: boolean;
}

export function Dock({ autoHide = false }: DockProps) {
  const openApps = useOpenApps();
  const appPaths = useAppPaths();
  const { openApp } = useUIActions();
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(!autoHide);
  const accessibleModules = useAccessibleModules();

  // Filter apps based on accessible modules
  const apps = useMemo(() => {
    return allApps.filter((app) => accessibleModules.includes(app.moduleId));
  }, [accessibleModules]);

  const handleAppClick = (app: DockApp) => {
    openApp(app.id);
    const savedPath = appPaths[app.id];
    router.push(savedPath || app.href);
  };

  const toggleDock = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      {/* Toggle button for autoHide mode */}
      {autoHide && (
        <Button
          isIconOnly
          size="lg"
          variant="flat"
          className="fixed bottom-20 left-4 md:bottom-6 md:left-6 z-50 shadow-lg rounded-full w-14 h-14 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl hidden md:flex"
          onPress={toggleDock}
        >
          <PanelBottom size={24} className="text-gray-600 dark:text-gray-300" />
        </Button>
      )}

      {/* Dock */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden md:block transition-all duration-300 ${
          autoHide && !isVisible
            ? "translate-y-[calc(100%+2rem)] opacity-0 pointer-events-none"
            : "translate-y-0 opacity-100"
        }`}
      >
        <div className="flex items-end gap-2 px-3 py-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg shadow-black/5">
          {/* Home */}
          <Tooltip content="Home" placement="top">
            <Link
              href="/home"
              className="group flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 transition-all duration-200 hover:scale-110 hover:-translate-y-1"
            >
              <Home size={24} className="text-gray-700 dark:text-gray-300" />
            </Link>
          </Tooltip>

          {/* Divider */}
          <div className="w-px h-10 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Apps - filtered by permissions */}
          {apps.map((app) => {
            const isOpen = openApps.includes(app.id);
            const AppIcon = app.icon;
            return (
              <Tooltip key={app.id} content={app.name} placement="top">
                <button
                  onClick={() => handleAppClick(app)}
                  className="group relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 hover:scale-110 hover:-translate-y-1"
                  style={{ background: app.color }}
                >
                  <AppIcon size={24} className="text-white" />
                  {/* Open indicator dot */}
                  {isOpen && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gray-600 dark:bg-gray-400" />
                  )}
                </button>
              </Tooltip>
            );
          })}

          {/* Divider */}
          <div className="w-px h-10 bg-gray-300 dark:bg-gray-600 mx-1" />

          {/* Settings */}
          <Tooltip content="Settings" placement="top">
            <Link
              href="/settings"
              className="group flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 transition-all duration-200 hover:scale-110 hover:-translate-y-1"
            >
              <Settings size={24} className="text-gray-700 dark:text-gray-300" />
            </Link>
          </Tooltip>
        </div>
      </div>
    </>
  );
}
