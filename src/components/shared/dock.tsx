"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tooltip } from "@heroui/react";
import { Home, Settings, Wallet, UtensilsCrossed } from "lucide-react";
import { useOpenApps, useAppPaths, useUIActions } from "@/lib/stores";

interface DockApp {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  href: string;
}

const apps: DockApp[] = [
  {
    id: "mealflow",
    name: "Mealflow",
    icon: UtensilsCrossed,
    color: "linear-gradient(135deg, #10b981, #059669)",
    href: "/mealflow",
  },
  {
    id: "finance",
    name: "Fintrack",
    icon: Wallet,
    color: "linear-gradient(135deg, #3b82f6, #4f46e5)",
    href: "/finance",
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
  // Initialize visibility based on autoHide - if autoHide is false, always visible
  const [isVisible, setIsVisible] = useState(() => !autoHide);
  const [isHovering, setIsHovering] = useState(false);

  const handleAppClick = (app: DockApp) => {
    openApp(app.id);
    // Restore the saved path if the app was minimized, otherwise go to base path
    const savedPath = appPaths[app.id];
    router.push(savedPath || app.href);
  };

  // Handle mouse position for auto-hide mode
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!autoHide) return;

      const triggerZone = 20; // pixels from bottom to trigger
      const windowHeight = window.innerHeight;

      if (e.clientY >= windowHeight - triggerZone) {
        setIsVisible(true);
      }
    },
    [autoHide]
  );

  // Add mouse move listener for auto-hide
  useEffect(() => {
    if (!autoHide) return;

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [autoHide, handleMouseMove]);

  const handleDockMouseEnter = () => {
    setIsHovering(true);
    setIsVisible(true);
  };

  const handleDockMouseLeave = () => {
    setIsHovering(false);
    if (autoHide) {
      setIsVisible(false);
    }
  };

  return (
    <>
      {/* Invisible trigger zone at bottom of screen (only for autoHide mode) */}
      {autoHide && (
        <div
          className="fixed bottom-0 left-0 right-0 h-5 z-40 hidden md:block"
          onMouseEnter={() => setIsVisible(true)}
        />
      )}

      {/* Dock */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 hidden md:block transition-all duration-300 ${
          autoHide
            ? isVisible || isHovering
              ? "translate-y-0 opacity-100"
              : "translate-y-full opacity-0"
            : ""
        }`}
        onMouseEnter={handleDockMouseEnter}
        onMouseLeave={handleDockMouseLeave}
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

          {/* Apps */}
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
