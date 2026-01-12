"use client";

import { useState } from "react";
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
import type { Space } from "@/lib/stores/space-store";

export function OrgSwitcher() {
  const spaces = useSpaces();
  const currentSpace = useCurrentSpace();
  const { setCurrentSpace, addSpace } = useSpaceActions();
  const user = useUser();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSwitchSpace = (space: Space) => {
    if (space.id !== currentSpace?.id) {
      setCurrentSpace(space);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !user) return;

    setIsCreating(true);
    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newSpace: Space = {
      id: crypto.randomUUID(),
      name: newTeamName.trim(),
      slug: newTeamName.trim().toLowerCase().replace(/\s+/g, "-"),
      mode: "commerce",
      ownerId: user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addSpace(newSpace);
    setCurrentSpace(newSpace);

    setIsCreating(false);
    setNewTeamName("");
    setIsCreateModalOpen(false);
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
          aria-label="Team switcher"
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
          <DropdownSection title="Teams" showDivider>
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
              <span className="font-medium">Create Team</span>
            </DropdownItem>
          </DropdownSection>
        </DropdownMenu>
      </Dropdown>

      {/* Create Team Modal */}
      <Modal isOpen={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Create New Team
              </ModalHeader>
              <ModalBody>
                <p className="text-sm text-gray-500 mb-4">
                  Create a new workspace for your team or project.
                </p>
                <Input
                  label="Team Name"
                  placeholder="e.g., Marketing Team"
                  value={newTeamName}
                  onValueChange={setNewTeamName}
                  autoFocus
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={isCreating}
                  isDisabled={!newTeamName.trim()}
                  onPress={handleCreateTeam}
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
