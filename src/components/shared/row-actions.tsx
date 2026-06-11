"use client";

import {
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { MoreVertical } from "lucide-react";
import { useHaptics } from "@/lib/hooks/use-haptics";

export interface RowAction {
  key: string;
  label: string;
  icon: React.ElementType;
  onPress: () => void;
  /** Render in danger color (e.g. Delete). */
  danger?: boolean;
}

/**
 * Per-row contextual actions that work on touch. On mobile it's a kebab (⋯) menu
 * — touch has no hover, so the previous opacity-0/group-hover icons were invisible.
 * On desktop it keeps the inline hover-reveal icons (relies on the row having a
 * `group` class).
 */
export function RowActions({ items }: { items: RowAction[] }) {
  const { tap } = useHaptics();
  if (items.length === 0) return null;

  return (
    <>
      {/* Mobile: kebab menu */}
      <div className="md:hidden">
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <Button isIconOnly size="sm" variant="light" aria-label="Actions">
              <MoreVertical size={18} />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="Row actions" onAction={() => tap()}>
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownItem
                  key={item.key}
                  startContent={<Icon size={16} />}
                  color={item.danger ? "danger" : "default"}
                  className={item.danger ? "text-danger" : undefined}
                  onPress={item.onPress}
                >
                  {item.label}
                </DropdownItem>
              );
            })}
          </DropdownMenu>
        </Dropdown>
      </div>

      {/* Desktop: inline icons, revealed on row hover */}
      <div className="hidden md:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              isIconOnly
              size="sm"
              variant="light"
              aria-label={item.label}
              onPress={item.onPress}
            >
              <Icon size={16} className={item.danger ? "text-danger" : undefined} />
            </Button>
          );
        })}
      </div>
    </>
  );
}
