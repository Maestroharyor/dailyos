"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Avatar,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { Settings, Sun, Moon, User, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useUser, useLogout } from "@/lib/stores";

export function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const user = useUser();
  const logout = useLogout();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">D</span>
            </div>
            <span className="font-semibold text-base sm:text-lg text-gray-900 dark:text-white">
              DailyOS
            </span>
          </Link>

          {/* Right Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {mounted && (
              <Button
                isIconOnly
                aria-label="Toggle theme"
                variant="light"
                radius="full"
                size="sm"
                className="sm:size-auto"
                onPress={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun size={18} className="sm:w-5 sm:h-5" />
                ) : (
                  <Moon size={18} className="sm:w-5 sm:h-5" />
                )}
              </Button>
            )}

            {/* Settings - hidden on mobile since it's in bottom nav */}
            <Link href="/settings" className="hidden sm:block">
              <Button
                isIconOnly
                aria-label="Settings"
                variant="light"
                radius="full"
                size="sm"
              >
                <Settings size={20} />
              </Button>
            </Link>

            {/* Avatar with Dropdown */}
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <Avatar
                  as="button"
                  src={user?.avatar || "https://i.pravatar.cc/150?u=default"}
                  size="sm"
                  className="cursor-pointer transition-transform hover:scale-105 w-8 h-8 sm:w-9 sm:h-9"
                />
              </DropdownTrigger>
              <DropdownMenu aria-label="User menu">
                <DropdownItem
                  key="profile"
                  className="h-14 gap-2"
                  textValue="Profile"
                >
                  <p className="font-semibold">{user?.name || "User"}</p>
                  <p className="text-sm text-default-500">{user?.email}</p>
                </DropdownItem>
                <DropdownItem
                  key="profile-link"
                  startContent={<User size={16} />}
                >
                  Profile
                </DropdownItem>
                <DropdownItem
                  key="settings"
                  startContent={<Settings size={16} />}
                  href="/settings"
                >
                  Settings
                </DropdownItem>
                <DropdownItem
                  key="logout"
                  color="danger"
                  startContent={<LogOut size={16} />}
                  onPress={handleLogout}
                >
                  Log Out
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  );
}
