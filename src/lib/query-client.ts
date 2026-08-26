import {
  QueryClient,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import { CACHE_MAX_AGE_MS } from "@/lib/offline/cache-policy";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
        // gcTime must be at least the persister's maxAge. The persister
        // dehydrates what is in memory, so a query collected before the next
        // write is simply absent from the stored cache — a POS that reloads
        // after 11 idle minutes would have found an empty catalogue. staleTime
        // is left alone: it governs refetching, not retention, so the app
        // still refreshes as eagerly as it did.
        gcTime: CACHE_MAX_AGE_MS,
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
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}
