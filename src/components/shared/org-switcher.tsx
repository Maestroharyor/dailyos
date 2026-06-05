"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
} from "@heroui/react";
import { Users, ChevronDown, Plus, Check } from "lucide-react";
import { useSpaces, useCurrentSpace, useSpaceActions, useUser } from "@/lib/stores";
import { useSetCurrentSpace as useSetAuthSpace } from "@/lib/stores/auth-store";
import type { Space, SpaceRole } from "@/lib/stores/space-store";
import type { RoleId } from "@/lib/types/permissions";

export function OrgSwitcher() {
  const router = useRouter();
  const spaces = useSpaces();
  const currentSpace = useCurrentSpace();
  const { setCurrentSpace, addSpace } = useSpaceActions();
  const setAuthSpace = useSetAuthSpace();
  const user = useUser();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSwitchSpace = (space: Space) => {
    if (space.id !== currentSpace?.id) {
      setCurrentSpace(space);
    }
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim() || !user) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSpaceName.trim() }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || "Failed to create space");
      }

      const space = json.data.space as Space;
      const role = json.data.membership.role as SpaceRole;

      addSpace(space);
      setCurrentSpace(space);
      setAuthSpace(space.id, role as RoleId);

      setNewSpaceName("");
      setIsCreateModalOpen(false);
      router.push("/commerce");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setIsCreating(false);
    }
  };

  if (!currentSpace) return null;

  return (
    <>
      <Dropdown placement="bottom-start">
        <DropdownTrigger>
          <Button
            variant="light"
            className="h-9 px-2 gap-1.5 font-medium text-gray-700 dark:text-gray-200"
            startContent={
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Users size={14} className="text-white" />
              </div>
            }
            endContent={<ChevronDown size={14} className="text-gray-400" />}
          >
            <span className="max-w-[120px] sm:max-w-[160px] truncate">
              {currentSpace.name}
            </span>
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          aria-label="Space switcher"
          className="w-64"
          onAction={(key) => {
            if (key === "create") {
              setIsCreateModalOpen(true);
            } else {
              const space = spaces.find((s) => s.id === key);
              if (space) handleSwitchSpace(space);
            }
          }}
        >
          <DropdownSection title="Spaces" showDivider>
            {spaces.map((space) => (
              <DropdownItem
                key={space.id}
                className="py-2"
                startContent={
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <Users size={16} className="text-white" />
                  </div>
                }
                endContent={
                  space.id === currentSpace.id ? (
                    <Check size={16} className="text-primary" />
                  ) : null
                }
              >
                <div className="flex flex-col">
                  <span className="font-medium">{space.name}</span>
                  <span className="text-xs text-gray-500 capitalize">
                    {space.mode} mode
                  </span>
                </div>
              </DropdownItem>
            ))}
          </DropdownSection>
          <DropdownSection>
            <DropdownItem
              key="create"
              className="py-2"
              startContent={
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Plus size={16} className="text-gray-500" />
                </div>
              }
            >
              <span className="font-medium">Create Space</span>
            </DropdownItem>
          </DropdownSection>
        </DropdownMenu>
      </Dropdown>

      {/* Create Space Modal */}
      <Modal isOpen={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Create New Space
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-gray-500 mb-4">
                  Create a new workspace. It starts empty with its own products,
                  customers, and settings.
                </p>
                <Input
                  label="Space Name"
                  placeholder="e.g., My Second Store"
                  value={newSpaceName}
                  onValueChange={setNewSpaceName}
                  autoFocus
                />
                {createError && (
                  <p className="text-sm text-danger mt-2">{createError}</p>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={isCreating}
                  isDisabled={!newSpaceName.trim()}
                  onPress={handleCreateSpace}
                >
                  Create
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
