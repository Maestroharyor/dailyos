"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import {
  persistQueryClientRestore,
  persistQueryClientSubscribe,
} from "@tanstack/react-query-persist-client";
import { useEffect, useMemo } from "react";
import {
  CACHE_MAX_AGE_MS,
  cacheBuster,
  shouldDehydrateOfflineQuery,
} from "@/lib/offline/cache-policy";
import { createIDBPersister } from "@/lib/offline/idb-persister";
import { getQueryClient } from "@/lib/query-client";
import { useSession } from "@/lib/supabase/use-session";

/**
 * Persists the commerce query cache to IndexedDB so the app has something to
 * render when the network is gone.
 *
 * Restore is driven here rather than by `PersistQueryClientProvider`, and the
 * reason is the buster. That component restores exactly once, from the
 * `persistOptions` it holds during its first effect, and at first render the
 * session has not resolved, so the buster reads `anonymous:v1`. React Query
 * treats a buster mismatch as a reason to *delete* the stored cache, not to
 * skip restoring it, so every reload would have wiped the cache it was
 * supposed to restore. The feature would have looked wired up and done
 * nothing.
 *
 * Waiting for the session costs nothing visible: the first paint happens
 * against an empty cache either way, and restored data arrives when it
 * arrives. What it buys is the guarantee that the cache we read and the cache
 * we later write are scoped to the same person.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { data: session, isPending } = useSession();
  const persister = useMemo(() => createIDBPersister(), []);
  const userId = session?.user.id;

  useEffect(() => {
    // Not "no user", "we do not know yet". Touching the store now would read
    // and then delete the previous session's cache.
    if (isPending) return;

    const options = {
      queryClient,
      persister,
      maxAge: CACHE_MAX_AGE_MS,
      // Scoped to the signed-in user, so a shift change on a shared till
      // discards the previous cashier's cache rather than restoring it.
      buster: cacheBuster(userId),
      dehydrateOptions: { shouldDehydrateQuery: shouldDehydrateOfflineQuery },
    };

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    persistQueryClientRestore(options)
      .catch(() => {
        // Already logged by the persister. A cache we cannot read is a cache
        // we do without; it must not stop the app from running online.
      })
      .finally(() => {
        // Subscribing only after the restore settles avoids writing the empty
        // in-memory cache over the stored one before it has been read.
        if (!cancelled) unsubscribe = persistQueryClientSubscribe(options);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [isPending, userId, queryClient, persister]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
