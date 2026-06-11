"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/lib/hooks/use-haptics";

interface FabProps {
  onPress: () => void;
  label: string;
  icon?: React.ElementType;
  className?: string;
}

/**
 * Floating action button for a page's primary "add" action. Mobile-only — desktop
 * pages keep their inline header button. Sits above the bottom nav + safe area and
 * fires an impact haptic on press.
 */
export function Fab({ onPress, label, icon: Icon = Plus, className }: FabProps) {
  const { impact } = useHaptics();

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        impact();
        onPress();
      }}
      className={cn(
        "md:hidden fixed right-4 z-40 flex items-center justify-center",
        "w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform",
        "bg-blue-600 text-white",
        // clear the 4rem bottom nav + the device safe-area inset
        "bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)]",
        className
      )}
    >
      <Icon size={26} />
    </button>
  );
}
