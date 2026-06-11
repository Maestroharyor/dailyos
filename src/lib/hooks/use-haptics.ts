"use client";

import { useMemo } from "react";
import { WebHaptics } from "web-haptics";

// Single shared WebHaptics instance for the whole app. Created lazily (client only)
// so SSR never touches the browser APIs and we don't spawn one instance per caller.
// On Android this drives navigator.vibrate; on iOS the Vibration API is missing so
// web-haptics silently falls back (it attempts the iOS <input switch> trick on its
// own). Either way these helpers never throw, so callers can fire them freely.
let instance: WebHaptics | null = null;

function getInstance(): WebHaptics | null {
  if (typeof window === "undefined") return null;
  if (!instance) {
    try {
      instance = new WebHaptics({ showSwitch: false });
    } catch {
      return null;
    }
  }
  return instance;
}

const STORAGE_KEY = "dailyos-haptics";

function isEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "off";
}

/** Semantic feedback kinds mapped to web-haptics presets. */
export type HapticKind =
  | "tap"
  | "selection"
  | "impact"
  | "success"
  | "warning"
  | "error";

const PRESET: Record<HapticKind, string> = {
  tap: "light",
  selection: "selection",
  impact: "medium",
  success: "success",
  warning: "warning",
  error: "error",
};

function fire(kind: HapticKind): void {
  if (!isEnabled()) return;
  const haptic = getInstance();
  if (!haptic) return;
  try {
    void haptic.trigger(PRESET[kind]);
  } catch {
    /* never let feedback break an interaction */
  }
}

/**
 * Plain (non-hook) haptics, usable anywhere — including React Query mutation
 * callbacks and event handlers outside components.
 */
export const haptics = {
  tap: () => fire("tap"),
  selection: () => fire("selection"),
  impact: () => fire("impact"),
  success: () => fire("success"),
  warning: () => fire("warning"),
  error: () => fire("error"),
  /** Persist the user's on/off preference (default on). */
  setEnabled: (on: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    }
  },
  isEnabled,
};

/** Hook form for components. Returns the same stable helpers as `haptics`. */
export function useHaptics() {
  return useMemo(() => haptics, []);
}
