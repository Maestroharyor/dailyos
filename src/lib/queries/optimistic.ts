"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Optimistic writes that reach every cached page of a list, not just the
 * unfiltered one.
 *
 * Every mutation hook in this app used to snapshot and write
 * `…list(spaceId, {})` — the key for "no filters, page one". A merchant who
 * has typed a search, picked a status, or paged forward is looking at a
 * *different* key, so the optimistic update landed somewhere they could not
 * see and the row did not move until the server answered.
 *
 * That was a cosmetic lag when every mutation resolved in 200ms. With the
 * outbox it is not: `onSettled`'s invalidate cannot resolve while the device
 * is offline, so the write that papers over it never arrives, and the change
 * simply does not appear until the shop is back online.
 *
 * Keys are `[…, "list", spaceId, filters]`, so the `lists(spaceId)` prefix
 * matches every filter and page variant React Query is holding.
 */

/** What `getQueriesData` returns: enough to put every page back as it was. */
export type ListSnapshot<T> = [QueryKey, T | undefined][];

function isFilters(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a cached page is one a newly created row belongs on.
 *
 * Lists are newest-first, so a create shows up at the top of page one. Putting
 * it at the top of page three as well would be inventing a row that is not
 * there, and the count on those pages is corrected by the invalidate.
 */
export function isFirstPage(key: QueryKey): boolean {
  const filters = key[key.length - 1];
  if (!isFilters(filters)) return true;
  return filters.page === undefined || filters.page === 1;
}

/**
 * Apply an update to every cached page and return what they held before.
 *
 * For changes that are true of a row wherever it appears: an edit, a toggle,
 * a delete. Pages that do not hold the row are handed to `update` too and are
 * expected to come back unchanged, which costs one map over a list already in
 * memory.
 */
export function patchLists<T>(
  queryClient: QueryClient,
  listsKey: QueryKey,
  update: (data: T) => T,
): ListSnapshot<T> {
  const previous = queryClient.getQueriesData<T>({ queryKey: listsKey });
  for (const [key, data] of previous) {
    if (data !== undefined) queryClient.setQueryData<T>(key, update(data));
  }
  return previous;
}

/**
 * Apply an update only to the pages a new row belongs on.
 *
 * Separate from `patchLists` rather than a flag on it, because the two answer
 * different questions: "this row changed" is true of every page holding it,
 * while "this row is new" is only true of the first.
 *
 * A create still lands on a filtered page the row does not match — a draft
 * product appearing while the list is filtered to active, say. Filters are
 * the server's to evaluate and guessing at them here would be a second,
 * divergent implementation of the query. The invalidate in `onSettled`
 * corrects it, and while offline the row is visibly pending anyway.
 */
export function patchFirstPages<T>(
  queryClient: QueryClient,
  listsKey: QueryKey,
  update: (data: T) => T,
): ListSnapshot<T> {
  const previous = queryClient.getQueriesData<T>({ queryKey: listsKey });
  for (const [key, data] of previous) {
    if (data !== undefined && isFirstPage(key)) {
      queryClient.setQueryData<T>(key, update(data));
    }
  }
  return previous;
}

/**
 * Put every page back the way it was.
 *
 * Restores from the whole snapshot, including pages the mutation left alone —
 * cheap, and it means a rollback cannot depend on remembering which pages
 * were touched.
 */
export function restoreLists<T>(
  queryClient: QueryClient,
  previous: ListSnapshot<T> | undefined,
): void {
  if (!previous) return;
  for (const [key, data] of previous) {
    if (data !== undefined) queryClient.setQueryData(key, data);
  }
}
