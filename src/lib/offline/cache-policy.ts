import type { Query } from "@tanstack/react-query";

/**
 * What may be written to disk, and how long it stays there.
 *
 * Persisting a query cache to IndexedDB is a security decision before it is a
 * size one. DailyOS runs on shared terminals, and IndexedDB survives sign-out,
 * so anything written here is readable by the next person to use the browser
 * until something explicitly clears it.
 */

/**
 * Bump when a persisted query's shape changes in a way that would break a
 * consumer reading last week's cache. Part of the persister's buster, so a
 * bump throws away every stored cache rather than deserialising a stale shape.
 */
export const CACHE_SCHEMA_VERSION = 1;

/** 24 hours: long enough to cover a closed shop, short enough to be a day's data. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Only commerce is persisted.
 *
 * Commerce is the module that has to keep working on a dead network, a till
 * cannot stop selling because the wifi dropped. Finance and mealflow have no
 * such requirement, and persisting them would put a merchant's revenue figures
 * on a shared terminal's disk for no benefit.
 */
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "commerce";
}

/**
 * A query is persisted when it is a successful commerce query.
 *
 * Errors and pending queries are deliberately excluded: restoring a failure
 * from yesterday would render an error state for something that may well be
 * fine now, and a pending query has nothing to restore.
 */
export function shouldDehydrateOfflineQuery(query: Query): boolean {
  return query.state.status === "success" && shouldPersistQueryKey(query.queryKey);
}

/**
 * Scopes the stored cache to one user and one schema.
 *
 * The user id is the important half. Two cashiers share a till; without it,
 * the second to sign in restores the first one's data from disk. React Query
 * throws the whole cache away when the buster changes, which is exactly the
 * behaviour wanted at a shift change.
 */
export function cacheBuster(userId: string | null | undefined): string {
  return `${userId ?? "anonymous"}:v${CACHE_SCHEMA_VERSION}`;
}
