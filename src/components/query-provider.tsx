"use client";

import { useMemo } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { getQueryClient } from "@/lib/query-client";
import { createIDBPersister } from "@/lib/offline/idb-persister";
import {
  CACHE_MAX_AGE_MS,
  cacheBuster,
  shouldDehydrateOfflineQuery,
} from "@/lib/offline/cache-policy";
import { useSession } from "@/lib/supabase/use-session";

/**
 * Persists the commerce query cache to IndexedDB so the app has something to
 * render when the network is gone.
 *
 * Restoring the cache does not delay the first paint: React Query renders from
 * an empty cache and swaps in the restored data when it arrives, so a slow or
 * refusing IndexedDB costs nothing but the offline benefit.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const { data: session } = useSession();
  const persister = useMemo(() => createIDBPersister(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        // Scoped to the signed-in user, so a shift change on a shared till
        // discards the previous cashier's cache rather than restoring it.
        buster: cacheBuster(session?.user.id),
        dehydrateOptions: {
          shouldDehydrateQuery: shouldDehydrateOfflineQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
