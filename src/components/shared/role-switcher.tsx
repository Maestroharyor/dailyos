"use client";

import { useState } from "react";
import {
  Button,
  Popover,
  PopoverTrigger,
  PopoverContent,
  RadioGroup,
  Radio,
  Divider,
  Chip,
} from "@heroui/react";
import { Shield, ChevronDown } from "lucide-react";
import { useUser, useDevModeRole, useSetDevModeRole } from "@/lib/stores/auth-store";
import { useAccountMode, useAccountActions } from "@/lib/stores/account-store";
import { PREDEFINED_ROLES, type RoleId, type AccountMode } from "@/lib/types/permissions";

/**
 * Dev-only role switcher for testing different permission levels
 * Only visible in development mode
 */
export function RoleSwitcher() {
  const user = useUser();
  const devModeRole = useDevModeRole();
  const setDevModeRole = useSetDevModeRole();
  const accountMode = useAccountMode();
  const { updateAccountMode } = useAccountActions();
  const [isOpen, setIsOpen] = useState(false);

  // Only show in development
  if (process.env.NODE_ENV !== "development") return null;

  const currentRole = devModeRole ?? user?.roleId ?? "viewer";
  const actualRole = user?.roleId ?? "viewer";

  const handleRoleChange = (value: string) => {
    if (value === actualRole) {
      setDevModeRole(null); // Reset to actual role
    } else {
      setDevModeRole(value as RoleId);
    }
  };

  const handleModeChange = (value: string) => {
    updateAccountMode(value as AccountMode);
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen} placement="top-end">
      <PopoverTrigger>
        <Button
          size="sm"
          variant="flat"
          className="fixed bottom-24 right-4 md:bottom-6 z-50 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
          startContent={<Shield size={16} />}
          endContent={<ChevronDown size={14} />}
        >
          {devModeRole ? (
            <span className="flex items-center gap-1">
              <span className="text-xs opacity-70">Testing:</span>
              {PREDEFINED_ROLES[currentRole]?.name}
            </span>
          ) : (
            PREDEFINED_ROLES[currentRole]?.name
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-4 w-72">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">Test Role</h4>
              {devModeRole && (
                <Chip size="sm" color="warning" variant="flat">
                  Override Active
                </Chip>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Switch roles to test permission behavior
            </p>
            <RadioGroup
              value={currentRole}
              onValueChange={handleRoleChange}
              size="sm"
            >
              {Object.entries(PREDEFINED_ROLES).map(([id, role]) => (
                <Radio key={id} value={id} description={role.description}>
                  <div className="flex items-center gap-2">
                    <span>{role.name}</span>
                    {id === actualRole && (
                      <Chip size="sm" color="primary" variant="flat">
                        Actual
                      </Chip>
                    )}
                  </div>
                </Radio>
              ))}
            </RadioGroup>
          </div>

          <Divider />

          <div>
            <h4 className="font-semibold text-sm mb-2">Account Mode</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Test mode restrictions (POS, Storefront)
            </p>
            <RadioGroup
              value={accountMode}
              onValueChange={handleModeChange}
              size="sm"
              orientation="horizontal"
            >
              <Radio value="commerce" description="Full commerce features">
                Commerce
              </Radio>
              <Radio value="internal" description="No POS/Storefront">
                Internal
              </Radio>
            </RadioGroup>
          </div>

          {devModeRole && (
            <>
              <Divider />
              <Button
                size="sm"
                variant="flat"
                color="warning"
                className="w-full"
                onPress={() => setDevModeRole(null)}
              >
                Reset to Actual Role
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
