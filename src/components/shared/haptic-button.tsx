"use client";

import { Button, type ButtonProps } from "@heroui/react";
import { useHaptics, type HapticKind } from "@/lib/hooks/use-haptics";

interface HapticButtonProps extends ButtonProps {
  /** Feedback kind fired on press. Defaults to a light "tap". */
  haptic?: HapticKind;
}

/**
 * Drop-in HeroUI Button that fires a haptic on press. Use for primary/action
 * buttons so taps feel physical on Android (no-ops gracefully on iOS).
 */
export function HapticButton({ haptic = "tap", onPress, ...props }: HapticButtonProps) {
  const feedback = useHaptics();

  return (
    <Button
      {...props}
      onPress={(e) => {
        feedback[haptic]();
        onPress?.(e);
      }}
    />
  );
}
