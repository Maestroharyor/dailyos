"use client";

import { addToast } from "@heroui/react";
import { haptics } from "@/lib/hooks/use-haptics";

/** Success feedback for a mutation: success haptic + a toast. */
export function notifySuccess(message: string) {
  haptics.success();
  addToast({ title: message, color: "success" });
}

/** Error feedback for a mutation: error haptic + a toast with the message. */
export function notifyError(error: unknown, fallback = "Something went wrong") {
  haptics.error();
  const message = error instanceof Error ? error.message : fallback;
  addToast({ title: message, color: "danger" });
}

/**
 * Something happened that the user needs to know about but did not cause and
 * cannot have failed at, a restored cart clamped to real stock, say.
 */
export function notifyWarning(message: string) {
  addToast({ title: message, color: "warning", timeout: 8000 });
}
