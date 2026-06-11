"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@heroui/react";
import { ChevronLeft, MoreHorizontal, LayoutGrid, Plus } from "lucide-react";
import { OrgSwitcher } from "@/components/shared/org-switcher";
import { useHaptics } from "@/lib/hooks/use-haptics";
import { useHeaderAction } from "@/lib/stores";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
}

interface MobileAppHeaderProps {
  appIcon: React.ElementType;
  appColor: string;
  appName: string;
  navItems: NavItem[];
  basePath: string;
}

/**
 * Native-style mobile header (phones only). Module home shows the app icon + space
 * switcher as the title; sub-pages show a back chevron + the page title. A "⋯" menu
 * gives quick jump to every section + settings. Replaces the macOS traffic-lights on
 * mobile (desktop keeps the SubAppHeader chrome).
 */
export function MobileAppHeader({
  appIcon: AppIcon,
  appColor,
  appName,
  navItems,
  basePath,
}: MobileAppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { tap, impact } = useHaptics();
  const headerAction = useHeaderAction();

  const isActive = (item: NavItem) =>
    item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const isHome = pathname === basePath;
  const activeItem = navItems.find(isActive);
  const title = activeItem?.label ?? appName;

  return (
    <header className="md:hidden sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800 safe-area-top select-none">
      <div className="flex items-center gap-2 h-14 px-3">
        {/* Left: back chevron on sub-pages, app icon on the module home */}
        <div className="flex items-center min-w-0 flex-1 gap-2">
          {isHome ? (
            <>
              {/* Tap the app icon to return to the home screen / switch apps. */}
              <Link
                href="/home"
                aria-label="Home screen"
                onClick={() => tap()}
                className="flex-shrink-0"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: appColor }}
                >
                  <AppIcon size={20} className="text-white" />
                </div>
              </Link>
              <OrgSwitcher />
            </>
          ) : (
            <>
              <button
                type="button"
                aria-label="Back"
                onClick={() => {
                  tap();
                  router.back();
                }}
                className="flex items-center justify-center w-10 h-10 -ml-1 rounded-full text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800"
              >
                <ChevronLeft size={26} />
              </button>
              <h1 className="text-base font-semibold truncate">{title}</h1>
            </>
          )}
        </div>

        {/* Right: page primary action ("+") then the jump-to menu */}
        {headerAction && (
          <button
            type="button"
            aria-label={headerAction.label}
            onClick={() => {
              impact();
              headerAction.onClick();
            }}
            className="flex items-center justify-center w-10 h-10 rounded-full text-blue-600 dark:text-blue-400 active:bg-gray-100 dark:active:bg-gray-800 flex-shrink-0"
          >
            <Plus size={26} />
          </button>
        )}
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <button
              type="button"
              aria-label="Menu"
              className="flex items-center justify-center w-10 h-10 rounded-full text-gray-700 dark:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800 flex-shrink-0"
            >
              <MoreHorizontal size={24} />
            </button>
          </DropdownTrigger>
          <DropdownMenu aria-label={`${appName} navigation`} onAction={() => tap()}>
            <DropdownSection showDivider>
              <DropdownItem
                key="__home"
                href="/home"
                startContent={<LayoutGrid size={18} />}
              >
                Home screen
              </DropdownItem>
            </DropdownSection>
            <DropdownSection title={appName}>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownItem
                    key={item.href}
                    href={item.href}
                    startContent={<Icon size={18} />}
                    className={isActive(item) ? "text-primary font-medium" : undefined}
                  >
                    {item.label}
                  </DropdownItem>
                );
              })}
            </DropdownSection>
          </DropdownMenu>
        </Dropdown>
      </div>
    </header>
  );
}
