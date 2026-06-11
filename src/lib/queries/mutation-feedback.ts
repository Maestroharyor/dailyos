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
