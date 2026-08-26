"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { drain, getOutboxSnapshot, subscribeToOutbox } from "./outbox";

/**
 * The queue, as a component sees it: what is waiting, and a way to push.
 *
 * Read through `useSyncExternalStore` over the snapshot the outbox keeps, so
 * there is no effect writing state back into React on every change.
 *
 * The drain is triggered from four places, because no single one covers a
 * shop's day:
 *
 * - the connection coming back (`onlineManager`)
 * - the tab becoming visible again, which is what happens when a cashier picks
 *   the terminal back up
 * - a slow poll while the app is open, for a connection that recovers without
 *   the browser noticing
 * - the cashier pressing "Sync now", because sometimes they can see it is
 *   working and we cannot
 */

const POLL_MS = 30_000;

export function useOutbox(spaceId: string) {
  const records = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribeToOutbox(spaceId, listener),
      [spaceId]
    ),
    useCallback(() => getOutboxSnapshot(spaceId), [spaceId]),
    // Server render: nothing is queued, because nothing has happened yet.
    () => EMPTY
  );

  useEffect(() => {
    if (!spaceId) return;

    const push = () => void drain(spaceId);

    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) push();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") push();
    };
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(push, POLL_MS);
    push();

    return () => {
      unsubscribeOnline();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [spaceId]);

  return useMemo(() => {
    const pending = records.filter(
      (r) => r.status === "pending" || r.status === "sending"
    );
    const failed = records.filter(
      (r) => r.status === "failed" || r.status === "poison"
    );
    return {
      records,
      pending,
      failed,
      /** Everything the server has not accepted yet. */
      unsyncedCount: pending.length + failed.length,
      syncNow: () => drain(spaceId),
    };
  }, [records, spaceId]);
}

const EMPTY: never[] = [];
