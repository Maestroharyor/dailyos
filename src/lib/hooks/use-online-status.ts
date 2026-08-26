"use client";

import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/**
 * Whether the app can actually reach the server.
 *
 * Built on React Query's `onlineManager` so query behaviour and the banner
 * agree by construction rather than by coincidence.
 *
 * **`navigator.onLine` is not the answer to this question.** It reports `true`
 * on a captive portal, on a router with no uplink, and on a wifi network that
 * has stopped forwarding — which is precisely the flaky case a shop has. It is
 * a useful negative (false means definitely offline) and a worthless positive,
 * so the heartbeat below is what actually decides.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (callback) => onlineManager.subscribe(callback),
    () => onlineManager.isOnline(),
    // The server has no opinion; assume online so nothing renders an offline
    // banner into the initial HTML.
    () => true
  );
}
