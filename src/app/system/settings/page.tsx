"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Divider,
  Switch,
} from "@heroui/react";
import {
  Building,
  Save,
  AlertTriangle,
  Store,
  Wallet,
  UtensilsCrossed,
} from "lucide-react";
import { useCurrentSpace, useSpaceActions, useUser } from "@/lib/stores";
import { unwrapAction } from "@/lib/action-mutation";
import { updateSpaceSettings } from "@/lib/actions/spaces";

const MODULES = [
  {
    id: "commerce",
    name: "Commerce",
    desc: "Products, orders, inventory, POS & storefront.",
    icon: Store,
    color: "text-orange-500",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
  {
    id: "finance",
    name: "Fintrack",
    desc: "Income, expenses, budgets and savings goals.",
    icon: Wallet,
    color: "text-blue-500",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  {
    id: "mealflow",
    name: "Mealflow",
    desc: "Meal planning, recipes and grocery lists.",
    icon: UtensilsCrossed,
    color: "text-emerald-500",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
  },
] as const;

export default function SystemSettingsPage() {
  const currentUser = useUser();
  const currentSpace = useCurrentSpace();
  const { updateSpace } = useSpaceActions();

  const [spaceName, setSpaceName] = useState(currentSpace?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  const enabledModules = currentSpace?.enabledModules ?? [
    "commerce",
    "finance",
    "mealflow",
  ];
  const commerceEnabled = enabledModules.includes("commerce");
  const posStorefrontEnabled = currentSpace?.mode === "commerce";

  const handleSaveName = async () => {
    if (!spaceName.trim() || !currentUser || !currentSpace) return;

    setIsSaving(true);
    const previousName = currentSpace.name;
    // Optimistic store update; persist server-side and revert on failure
    updateSpace(currentSpace.id, { name: spaceName.trim() });
    try {
      await unwrapAction(
        updateSpaceSettings(currentSpace.id, { name: spaceName.trim() })
      );
    } catch (err) {
      console.error("Failed to rename space:", err);
      updateSpace(currentSpace.id, { name: previousName });
      setSpaceName(previousName);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleModule = async (moduleId: string) => {
    if (!currentSpace) return;
    const previous = enabledModules;
    const next = previous.includes(moduleId)
      ? previous.filter((m) => m !== moduleId)
      : [...previous, moduleId];
    updateSpace(currentSpace.id, { enabledModules: next });
    try {
      await unwrapAction(
        updateSpaceSettings(currentSpace.id, { enabledModules: next })
      );
    } catch (err) {
      console.error("Failed to update modules:", err);
      updateSpace(currentSpace.id, { enabledModules: previous });
    }
  };

  const togglePosStorefront = async () => {
    if (!currentSpace) return;
    const previousMode = currentSpace.mode;
    const nextMode = previousMode === "commerce" ? "internal" : "commerce";
    updateSpace(currentSpace.id, { mode: nextMode });
    try {
      await unwrapAction(
        updateSpaceSettings(currentSpace.id, { mode: nextMode })
      );
    } catch (err) {
      console.error("Failed to update commerce features:", err);
      updateSpace(currentSpace.id, { mode: previousMode });
    }
  };

  if (!currentSpace) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Loading space settings...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Space Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your space settings
        </p>
      </div>

      {/* Space Name */}
      <Card className="mb-6">
        <CardHeader className="flex items-center gap-2">
          <Building size={20} className="text-gray-500" />
          <h2 className="font-semibold">Space Name</h2>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              label="Space Name"
              value={spaceName}
              onValueChange={setSpaceName}
              className="flex-1"
              placeholder="Enter space name"
            />
            <Button
              color="primary"
              isLoading={isSaving}
              isDisabled={!spaceName.trim() || spaceName === currentSpace.name}
              onPress={handleSaveName}
              startContent={!isSaving && <Save size={18} />}
              className="sm:self-end"
            >
              Save
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Modules */}
      <Card className="mb-6">
        <CardHeader className="flex items-center gap-2">
          <Store size={20} className="text-gray-500" />
          <h2 className="font-semibold">Modules</h2>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-4">
          <p className="text-sm text-gray-500">
            Choose which apps are active for this space. Turning one off hides it
            for everyone and blocks its pages.
          </p>

          <div className="space-y-3">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              const on = enabledModules.includes(mod.id);
              return (
                <div key={mod.id}>
                  <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${mod.bg}`}>
                        <Icon size={22} className={mod.color} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{mod.name}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{mod.desc}</p>
                      </div>
                    </div>
                    <Switch
                      isSelected={on}
                      onValueChange={() => toggleModule(mod.id)}
                      aria-label={`Toggle ${mod.name}`}
                    />
                  </div>

                  {/* Commerce sub-option: POS & Storefront (only when commerce is on) */}
                  {mod.id === "commerce" && commerceEnabled && (
                    <div className="ml-6 mt-2 flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <div>
                        <p className="text-sm font-medium">POS &amp; Storefront</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Turn off for internal-only commerce (inventory &amp; orders,
                          no point-of-sale or public storefront).
                        </p>
                      </div>
                      <Switch
                        size="sm"
                        isSelected={posStorefrontEnabled}
                        onValueChange={togglePosStorefront}
                        aria-label="Toggle POS and Storefront"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Danger Zone */}
      <Card className="border-2 border-danger/20">
        <CardHeader className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-danger" />
          <h2 className="font-semibold text-danger">Danger Zone</h2>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium">Delete Space</h3>
              <p className="text-sm text-gray-500">
                Permanently delete this space and all its data. This action cannot be undone.
              </p>
            </div>
            <Button color="danger" variant="flat" isDisabled>
              Delete Space
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Space deletion is disabled in the demo. In production, this would require additional verification.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
