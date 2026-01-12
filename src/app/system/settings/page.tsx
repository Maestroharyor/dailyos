"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Divider,
  Chip,
} from "@heroui/react";
import { Building, Save, AlertTriangle, Store, Briefcase } from "lucide-react";
import { useCurrentSpace, useSpaceActions, useUser } from "@/lib/stores";
import type { SpaceMode } from "@/lib/stores/space-store";

export default function SystemSettingsPage() {
  const currentUser = useUser();
  const currentSpace = useCurrentSpace();
  const { updateSpace } = useSpaceActions();

  const [spaceName, setSpaceName] = useState(currentSpace?.name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showModeWarning, setShowModeWarning] = useState(false);
  const [pendingMode, setPendingMode] = useState<SpaceMode | null>(null);

  const handleSaveName = async () => {
    if (!spaceName.trim() || !currentUser || !currentSpace) return;

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    updateSpace(currentSpace.id, { name: spaceName.trim() });

    setIsSaving(false);
  };

  const handleModeChange = (newMode: SpaceMode) => {
    if (newMode === currentSpace?.mode) return;
    setPendingMode(newMode);
    setShowModeWarning(true);
  };

  const confirmModeChange = () => {
    if (!pendingMode || !currentUser || !currentSpace) return;

    updateSpace(currentSpace.id, { mode: pendingMode });

    setShowModeWarning(false);
    setPendingMode(null);
  };

  const cancelModeChange = () => {
    setShowModeWarning(false);
    setPendingMode(null);
  };

  if (!currentSpace) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Loading space settings...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24 md:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          Team Settings
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Manage your team settings
        </p>
      </div>

      {/* Space Name */}
      <Card className="mb-6">
        <CardHeader className="flex items-center gap-2">
          <Building size={20} className="text-gray-500" />
          <h2 className="font-semibold">Team Name</h2>
        </CardHeader>
        <Divider />
        <CardBody>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              label="Team Name"
              value={spaceName}
              onValueChange={setSpaceName}
              className="flex-1"
              placeholder="Enter team name"
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

      {/* Space Mode */}
      <Card className="mb-6">
        <CardHeader className="flex items-center gap-2">
          <Store size={20} className="text-gray-500" />
          <h2 className="font-semibold">Account Mode</h2>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-6">
          <p className="text-sm text-gray-500">
            Account mode determines which features are available to your organization.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Commerce Mode */}
            <div
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                currentSpace.mode === "commerce"
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
              onClick={() => handleModeChange("commerce")}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <Store size={24} className="text-orange-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Commerce</h3>
                    {currentSpace.mode === "commerce" && (
                      <Chip size="sm" color="primary" variant="flat">
                        Active
                      </Chip>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Full access to all commerce features including POS and Storefront.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Chip size="sm" variant="flat">POS</Chip>
                    <Chip size="sm" variant="flat">Storefront</Chip>
                    <Chip size="sm" variant="flat">Inventory</Chip>
                    <Chip size="sm" variant="flat">Orders</Chip>
                  </div>
                </div>
              </div>
            </div>

            {/* Internal Mode */}
            <div
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                currentSpace.mode === "internal"
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
              onClick={() => handleModeChange("internal")}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <Briefcase size={24} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Internal</h3>
                    {currentSpace.mode === "internal" && (
                      <Chip size="sm" color="primary" variant="flat">
                        Active
                      </Chip>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    For internal operations only. POS and Storefront are disabled.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Chip size="sm" variant="flat" className="line-through opacity-50">POS</Chip>
                    <Chip size="sm" variant="flat" className="line-through opacity-50">Storefront</Chip>
                    <Chip size="sm" variant="flat">Inventory</Chip>
                    <Chip size="sm" variant="flat">Orders</Chip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Mode Change Warning Modal */}
      {showModeWarning && pendingMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <AlertTriangle size={24} className="text-amber-500" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Change Account Mode?</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    You are about to switch from{" "}
                    <strong className="capitalize">{currentSpace.mode}</strong> to{" "}
                    <strong className="capitalize">{pendingMode}</strong> mode.
                  </p>
                </div>
              </div>

              {pendingMode === "internal" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    <strong>Warning:</strong> Switching to Internal mode will disable
                    POS and Storefront features for all users. Users with Cashier
                    role will lose access to their primary functions.
                  </p>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="flat" onPress={cancelModeChange}>
                  Cancel
                </Button>
                <Button color="primary" onPress={confirmModeChange}>
                  Confirm Change
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

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
              <h3 className="font-medium">Delete Team</h3>
              <p className="text-sm text-gray-500">
                Permanently delete this team and all its data. This action cannot be undone.
              </p>
            </div>
            <Button color="danger" variant="flat" isDisabled>
              Delete Team
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Team deletion is disabled in the demo. In production, this would require additional verification.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
