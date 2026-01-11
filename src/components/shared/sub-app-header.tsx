"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip } from "@heroui/react";
import { useUIActions } from "@/lib/stores";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

interface SubAppHeaderProps {
  appId: string;
  appIcon: React.ElementType;
  appColor: string;
  navItems: NavItem[];
  basePath: string;
}

export function SubAppHeader({
  appId,
  appIcon,
  appColor,
  navItems,
  basePath,
}: SubAppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { minimizeApp, closeApp, clearMinimizing } = useUIActions();

  const isAnimating = useRef(false);

  const handleClose = () => {
    closeApp(appId);
    router.push("/home");
  };

  const handleMinimize = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;

    // Save current path for restoration
    minimizeApp(appId, pathname);

    // Get the main content element
    const mainContent = document.querySelector("main.has-bottom-nav");
    const header = document.querySelector("header");

    if (mainContent && header) {
      // Create a snapshot overlay for smooth animation
      const overlay = document.createElement("div");
      overlay.id = "minimize-overlay";
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: inherit;
        pointer-events: none;
      `;

      // Clone content into overlay
      const contentClone = document.createElement("div");
      contentClone.style.cssText = `
        position: absolute;
        inset: 0;
        background: var(--background);
        transform-origin: bottom center;
        animation: minimizeToHome 0.35s cubic-bezier(0.32, 0, 0.67, 0) forwards;
      `;
      overlay.appendChild(contentClone);
      document.body.appendChild(overlay);

      // Hide original content during animation
      (mainContent as HTMLElement).style.opacity = "0";
      (header as HTMLElement).style.opacity = "0";

      // Navigate and cleanup after animation
      setTimeout(() => {
        router.push("/home");

        // Cleanup after navigation
        requestAnimationFrame(() => {
          const existingOverlay = document.getElementById("minimize-overlay");
          if (existingOverlay) {
            existingOverlay.remove();
          }
          clearMinimizing();
          isAnimating.current = false;
        });
      }, 300);
    } else {
      // Fallback if elements not found
      router.push("/home");
      clearMinimizing();
      isAnimating.current = false;
    }
  }, [appId, pathname, minimizeApp, router, clearMinimizing]);

  return (
    <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14">
          {/* Left: Window Controls + App Icon */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* macOS-style Window Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Tooltip content="Close" placement="bottom" delay={500}>
                <button
                  onClick={handleClose}
                  className="group w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#FF5F57] hover:bg-[#FF5F57]/80 transition-colors flex items-center justify-center"
                  aria-label="Close app"
                >
                  <span className="opacity-0 group-hover:opacity-100 text-[8px] sm:text-[10px] font-bold text-black/60">
                    ×
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Minimize" placement="bottom" delay={500}>
                <button
                  onClick={handleMinimize}
                  className="group w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#FEBC2E] hover:bg-[#FEBC2E]/80 transition-colors flex items-center justify-center"
                  aria-label="Minimize app"
                >
                  <span className="opacity-0 group-hover:opacity-100 text-[8px] sm:text-[10px] font-bold text-black/60">
                    −
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Expand" placement="bottom" delay={500}>
                <button
                  className="group w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-[#28C840] hover:bg-[#28C840]/80 transition-colors flex items-center justify-center cursor-default opacity-50"
                  aria-label="Expand app"
                  disabled
                >
                  <span className="opacity-0 group-hover:opacity-100 text-[6px] sm:text-[8px] font-bold text-black/60">
                    ↗
                  </span>
                </button>
              </Tooltip>
            </div>

            {/* App Icon */}
            <Link href={basePath} className="flex items-center">
              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center"
                style={{ background: appColor }}
              >
                {(() => {
                  const AppIcon = appIcon;
                  return <AppIcon size={16} className="text-white sm:w-[18px] sm:h-[18px]" />;
                })()}
              </div>
            </Link>
          </div>

          {/* Right: Navigation - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide">
            {navItems.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
