"use client";

import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { get, set, del, createStore, type UseStore } from "idb-keyval";

/**
 * An asynchronous persister backed by IndexedDB.
 *
 * localStorage would be simpler and is wrong here twice over: it is
 * synchronous, so writing a POS catalogue blocks the main thread on the
 * terminal least able to afford it, and its ~5MB ceiling is well inside what a
 * product grid with stock can reach.
 *
 * Every operation swallows its error. A browser can refuse IndexedDB outright
 * — private windows, storage pressure, a locked profile — and none of those
 * are a reason to stop the app from working online.
 */

const DB_NAME = "dailyos-offline";
const STORE_NAME = "query-cache";
const CACHE_KEY = "react-query";

let store: UseStore | undefined;

function getStore(): UseStore | null {
  if (typeof indexedDB === "undefined") return null;
  if (!store) store = createStore(DB_NAME, STORE_NAME);
  return store;
}

export function createIDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const idb = getStore();
      if (!idb) return;
      try {
        await set(CACHE_KEY, client, idb);
      } catch (error) {
        console.warn("Could not persist the query cache:", error);
      }
    },
    restoreClient: async () => {
      const idb = getStore();
      if (!idb) return undefined;
      try {
        return await get<PersistedClient>(CACHE_KEY, idb);
      } catch (error) {
        console.warn("Could not restore the query cache:", error);
        return undefined;
      }
    },
    removeClient: async () => {
      const idb = getStore();
      if (!idb) return;
      try {
        await del(CACHE_KEY, idb);
      } catch (error) {
        console.warn("Could not clear the query cache:", error);
      }
    },
  };
}

/**
 * Drop the stored cache outright. Called on sign-out, where "this user's data
 * must not be on this machine any more" is the whole requirement and waiting
 * for React Query's own buster check at next boot is too late.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  const idb = getStore();
  if (!idb) return;
  try {
    await del(CACHE_KEY, idb);
  } catch (error) {
    console.warn("Could not clear the query cache:", error);
  }
}
