import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { CACHE_MAX_AGE_MS } from "@/lib/offline/cache-policy";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
        gcTime: 10 * 60 * 1000, // 10 minutes - cache persists longer
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        onError: (error) => {
          console.error("Mutation error:", error);
        },
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

/**
 * Commerce is kept in memory for as long as it is kept on disk.
 *
 * The persister dehydrates what is still in memory, so a query garbage-
 * collected before the next write is not stale in the stored cache — it is
 * absent. gcTime therefore has to be at least the persister's maxAge, or a POS
 * reloading after a quiet spell finds an empty catalogue.
 *
 * Scoped to the commerce key prefix rather than raised globally. Only commerce
 * is persisted, and giving finance, mealflow and the rest 24h of retention
 * they have no use for would mean holding a merchant's figures in memory for a
 * whole shift on a shared terminal, for nothing.
 *
 * staleTime is deliberately untouched: it governs refetching, not retention,
 * so the POS still refreshes stock as eagerly as it ever did.
 */
function applyCommerceRetention(client: QueryClient) {
  client.setQueryDefaults(["commerce"], { gcTime: CACHE_MAX_AGE_MS });
  return client;
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return applyCommerceRetention(makeQueryClient());
  } else {
    // Browser: make a new client if we don't already have one
    if (!browserQueryClient) {
      browserQueryClient = applyCommerceRetention(makeQueryClient());
    }
    return browserQueryClient;
  }
}
