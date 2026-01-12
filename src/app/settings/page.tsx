"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Avatar,
  Input,
  Switch,
  RadioGroup,
  Radio,
  Card,
  CardBody,
  CardHeader,
  Divider,
} from "@heroui/react";
import {
  ArrowLeft,
  User,
  Palette,
  Camera,
  Mail,
  Lock,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useUser, useLogout, useUpdateProfile, useAppsView, useUIActions } from "@/lib/stores";
import { config } from "@/lib/config";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const user = useUser();
  const logout = useLogout();
  const updateProfile = useUpdateProfile();
  const appsView = useAppsView();
  const { setAppsView } = useUIActions();
  const router = useRouter();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [fontSize, setFontSize] = useState("default");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);

  const handleSaveProfile = () => {
    updateProfile({ name, email });
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 h-16">
            <Link href="/home">
              <Button isIconOnly variant="light" aria-label="Go back">
                <ArrowLeft size={20} />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Settings
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Account & Profile Section */}
          <Card className="bg-white dark:bg-gray-900">
            <CardHeader className="flex gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <User size={20} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex flex-col">
                <p className="text-lg font-semibold">Account & Profile</p>
                <p className="text-small text-default-500">
                  Manage your personal information
                </p>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="gap-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <Avatar
                  src={user?.avatar || "https://i.pravatar.cc/150?u=default"}
                  className="w-20 h-20"
                />
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="bordered"
                    startContent={<Camera size={16} />}
                  >
                    Change Photo
                  </Button>
                  <p className="text-xs text-default-400">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>

              {/* Name */}
              <Input
                label="Full Name"
                placeholder="Enter your name"
                value={name}
                onValueChange={setName}
                startContent={<User size={16} className="text-default-400" />}
                variant="bordered"
              />

              {/* Email */}
              <Input
                label="Email Address"
                placeholder="Enter your email"
                type="email"
                value={email}
                onValueChange={setEmail}
                startContent={<Mail size={16} className="text-default-400" />}
                variant="bordered"
              />

              {/* Password */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-default-200 dark:border-default-100">
                <div className="flex items-center gap-3">
                  <Lock size={20} className="text-default-400" />
                  <div>
                    <p className="font-medium">Password</p>
                    <p className="text-sm text-default-400">
                      Last changed 30 days ago
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="flat">
                  Change
                </Button>
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button color="primary" onPress={handleSaveProfile}>
                  Save Changes
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Appearance Section */}
          <Card className="bg-white dark:bg-gray-900">
            <CardHeader className="flex gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Palette
                  size={20}
                  className="text-purple-600 dark:text-purple-400"
                />
              </div>
              <div className="flex flex-col">
                <p className="text-lg font-semibold">Appearance</p>
                <p className="text-small text-default-500">
                  Customize how {config.appName} looks
                </p>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="gap-6">
              {/* Theme */}
              <div>
                <p className="font-medium mb-3">Theme</p>
                <RadioGroup
                  orientation="horizontal"
                  value={theme}
                  onValueChange={setTheme}
                  classNames={{
                    wrapper: "gap-4",
                  }}
                >
                  <Radio value="light">
                    <span className="text-sm">Light</span>
                  </Radio>
                  <Radio value="dark">
                    <span className="text-sm">Dark</span>
                  </Radio>
                  <Radio value="system">
                    <span className="text-sm">System</span>
                  </Radio>
                </RadioGroup>
              </div>

              <Divider />

              {/* Apps View */}
              <div>
                <p className="font-medium mb-3">Apps View</p>
                <p className="text-sm text-default-400 mb-3">
                  Choose how apps are displayed on the home screen
                </p>
                <RadioGroup
                  orientation="horizontal"
                  value={appsView}
                  onValueChange={(value) => setAppsView(value as "os" | "cards")}
                  classNames={{
                    wrapper: "gap-4",
                  }}
                >
                  <Radio value="os">
                    <span className="text-sm">Desktop Icons</span>
                  </Radio>
                  <Radio value="cards">
                    <span className="text-sm">Cards</span>
                  </Radio>
                </RadioGroup>
              </div>

              <Divider />

              {/* Font Size */}
              <div>
                <p className="font-medium mb-3">Font Size</p>
                <RadioGroup
                  orientation="horizontal"
                  value={fontSize}
                  onValueChange={setFontSize}
                  classNames={{
                    wrapper: "gap-4",
                  }}
                >
                  <Radio value="small">
                    <span className="text-sm">Small</span>
                  </Radio>
                  <Radio value="default">
                    <span className="text-sm">Default</span>
                  </Radio>
                  <Radio value="large">
                    <span className="text-sm">Large</span>
                  </Radio>
                </RadioGroup>
              </div>

              <Divider />

              {/* Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Reduced Motion</p>
                    <p className="text-sm text-default-400">
                      Minimize animations throughout the app
                    </p>
                  </div>
                  <Switch
                    isSelected={reducedMotion}
                    onValueChange={setReducedMotion}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Compact Layout</p>
                    <p className="text-sm text-default-400">
                      Use smaller spacing and padding
                    </p>
                  </div>
                  <Switch
                    isSelected={compactLayout}
                    onValueChange={setCompactLayout}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Sign Out Section */}
          <Card className="bg-white dark:bg-gray-900">
            <CardBody>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                    <LogOut
                      size={20}
                      className="text-red-600 dark:text-red-400"
                    />
                  </div>
                  <div>
                    <p className="font-medium">Sign Out</p>
                    <p className="text-sm text-default-400">
                      Sign out of your {config.appName} account
                    </p>
                  </div>
                </div>
                <Button color="danger" variant="flat" onPress={handleLogout}>
                  Sign Out
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </main>
    </div>
  );
}
