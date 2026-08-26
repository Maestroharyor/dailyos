"use client";

import { useEffect } from "react";
import { startHeartbeat } from "@/lib/offline/heartbeat";
import { registerCommerceDispatchers } from "@/lib/offline/dispatchers";

/**
 * Turns the offline machinery on for the commerce module.
 *
 * Mounted from the layout rather than the POS page so a sale queued at the
 * till still syncs from a tab someone left on the orders list — the drain must
 * not depend on the page that created the work being open.
 */
export function OfflineBootstrap() {
  useEffect(() => {
    registerCommerceDispatchers();
    return startHeartbeat();
  }, []);

  return null;
}
