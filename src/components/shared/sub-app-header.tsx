"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Tooltip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useUIActions } from "@/lib/stores";
import { OrgSwitcher } from "@/components/shared/org-switcher";
import { MobileAppHeader } from "@/components/shared/mobile-app-header";

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
  /** Display name for the mobile header; defaults to a capitalized appId. */
  appName?: string;
  /** Max nav items shown inline before overflowing into a "More" menu. */
  maxInlineItems?: number;
}

export function SubAppHeader({
  appId,
  appIcon,
  appColor,
  navItems,
  basePath,
  appName,
  maxInlineItems = 5,
}: SubAppHeaderProps) {
  const resolvedAppName =
    appName ?? appId.charAt(0).toUpperCase() + appId.slice(1);
  const pathname = usePathname();
  const router = useRouter();
  const { minimizeApp, closeApp, clearMinimizing } = useUIActions();

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  // Pin a Settings item (if any) to the right; split the rest into inline + overflow.
  const settingsItem = navItems.find((item) => item.href.endsWith("/settings"));
  const mainItems = navItems.filter((item) => item !== settingsItem);
  const overflows = mainItems.length > maxInlineItems + 1;
  const inlineItems = overflows ? mainItems.slice(0, maxInlineItems) : mainItems;
  const moreItems = overflows ? mainItems.slice(maxInlineItems) : [];
  const moreActive = moreItems.some(isActive);

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
    <>
      {/* Native mobile header (phones); replaces the macOS chrome below on < md. */}
      <MobileAppHeader
        appIcon={appIcon}
        appColor={appColor}
        appName={resolvedAppName}
        navItems={navItems}
        basePath={basePath}
      />

      {/* Desktop: macOS-style window chrome + horizontal nav. */}
      <header className="hidden md:block sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12 sm:h-14">
          {/* Left: Window Controls + App Icon */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* macOS-style Window Controls. Each colored dot sits inside a larger
                transparent hit area so it stays tappable on touch screens. */}
            <div className="flex items-center -ml-1.5">
              <Tooltip content="Close (Home)" placement="bottom" delay={500}>
                <button
                  onClick={handleClose}
                  className="group cursor-pointer flex items-center justify-center w-8 h-8 rounded-full"
                  aria-label="Close app, go to home screen"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] group-hover:bg-[#FF5F57]/80 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-black/60">
                      ×
                    </span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Minimize" placement="bottom" delay={500}>
                <button
                  onClick={handleMinimize}
                  className="group cursor-pointer flex items-center justify-center w-8 h-8 rounded-full"
                  aria-label="Minimize app"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] group-hover:bg-[#FEBC2E]/80 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-black/60">
                      −
                    </span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="Expand" placement="bottom" delay={500}>
                <button
                  className="group flex items-center justify-center w-8 h-8 rounded-full cursor-default"
                  aria-label="Expand app"
                  disabled
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#28C840] opacity-50 flex items-center justify-center" />
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

            {/* Space switcher: module data is space-scoped, so switching here
                refetches everything via spaceId-keyed React Query caches */}
            <div className="border-l border-gray-200 dark:border-gray-800 h-5" />
            <OrgSwitcher />
          </div>

          {/* Right: Navigation - Hidden on mobile */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-2 overflow-x-auto scrollbar-hide">
            {inlineItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive(item)
                      ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {moreItems.length > 0 && (
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <button
                    type="button"
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      moreActive
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    <span>More</span>
                    <ChevronDown size={14} />
                  </button>
                </DropdownTrigger>
                <DropdownMenu aria-label="More navigation">
                  {moreItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownItem
                        key={item.href}
                        href={item.href}
                        startContent={<Icon size={16} />}
                        className={
                          isActive(item)
                            ? "text-primary font-medium"
                            : undefined
                        }
                      >
                        {item.label}
                      </DropdownItem>
                    );
                  })}
                </DropdownMenu>
              </Dropdown>
            )}

            {settingsItem && (
              <>
                <div className="border-l border-gray-200 dark:border-gray-800 h-5 mx-0.5" />
                <Tooltip content={settingsItem.label} placement="bottom" delay={500}>
                  <Link
                    href={settingsItem.href}
                    aria-label={settingsItem.label}
                    className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                      isActive(settingsItem)
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                  >
                    {(() => {
                      const SettingsIcon = settingsItem.icon;
                      return <SettingsIcon size={18} />;
                    })()}
                  </Link>
                </Tooltip>
              </>
            )}
          </nav>
        </div>
      </div>
      </header>
    </>
  );
}
