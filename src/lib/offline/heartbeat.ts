"use client";

import { onlineManager } from "@tanstack/react-query";

/**
 * A cheap reachability check, because `navigator.onLine` lies.
 *
 * It reports `true` on a captive portal, on a router with no uplink, and on a
 * wifi network that has stopped forwarding, the exact conditions a shop's
 * connection fails under. So a browser "online" event is treated as a reason
 * to *check*, not as an answer.
 *
 * The probe is a HEAD for the web manifest: a static file, no session, no
 * database, a few hundred bytes. `cache: "no-store"` matters, a cached 200
 * would report a dead network as healthy.
 */

const PROBE_URL = "/manifest.webmanifest";
const PROBE_TIMEOUT_MS = 4_000;
/** While offline, poll for recovery. While online, the browser's events do. */
const OFFLINE_POLL_MS = 15_000;

export async function probeConnection(): Promise<boolean> {
  // A useful negative: the browser saying "offline" is always true.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${PROBE_URL}?t=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keep `onlineManager` honest. Returns a teardown function.
 */
export function startHeartbeat(): () => void {
  if (typeof window === "undefined") return () => {};

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = async () => {
    if (stopped) return;
    const reachable = await probeConnection();
    if (stopped) return;

    if (reachable !== onlineManager.isOnline()) {
      onlineManager.setOnline(reachable);
    }

    // Only poll while offline. Online, the browser's own events are enough and
    // a background request every 15 seconds on a metered connection is rude.
    clearTimeout(timer);
    if (!reachable) timer = setTimeout(check, OFFLINE_POLL_MS);
  };

  const onBrowserEvent = () => void check();

  window.addEventListener("online", onBrowserEvent);
  window.addEventListener("offline", onBrowserEvent);
  document.addEventListener("visibilitychange", onBrowserEvent);
  void check();

  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", onBrowserEvent);
    window.removeEventListener("offline", onBrowserEvent);
    document.removeEventListener("visibilitychange", onBrowserEvent);
  };
}
