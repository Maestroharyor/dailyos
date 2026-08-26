"use client";

import type { OutboxStatus } from "./outbox-policy";

/**
 * The queue itself, on disk. A dumb adapter on purpose: every decision about
 * what goes out, in what order, and what a failure means lives in the pure
 * modules beside this one.
 *
 * Raw IndexedDB rather than idb-keyval, because this needs indexes — the drain
 * reads by space and status, and reading the whole queue to filter it in JS
 * gets slower every day the shop trades.
 */

const DB_NAME = "dailyos-outbox";
const DB_VERSION = 1;
const RECORDS = "records";
const ID_MAP = "idMap";

export type OutboxEntity = "order" | "customer" | "stock";

export interface OutboxRecord {
  /** A ULID. Doubles as the clientRequestId sent to the server. */
  id: string;
  /** Monotonic per device: the order the cashier did things in. */
  seq: number;
  spaceId: string;
  userId: string;
  entity: OutboxEntity;
  action: string;
  payload: unknown;
  /** Set when this record's create produces an id others are waiting on. */
  localId?: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
  /** Set once dispatched, for the receipt and the sync screen. */
  serverId?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS)) {
        const store = db.createObjectStore(RECORDS, { keyPath: "id" });
        store.createIndex("bySpace", "spaceId");
        store.createIndex("bySpaceStatus", ["spaceId", "status"]);
        store.createIndex("bySeq", "seq");
      }
      if (!db.objectStoreNames.contains(ID_MAP)) {
        db.createObjectStore(ID_MAP);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = fn(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      })
  );
}

export function isOutboxAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function putRecord(record: OutboxRecord): Promise<void> {
  await run(RECORDS, "readwrite", (store) => store.put(record));
}

export async function getRecord(id: string): Promise<OutboxRecord | undefined> {
  return run<OutboxRecord | undefined>(RECORDS, "readonly", (store) => store.get(id));
}

export async function listRecords(spaceId: string): Promise<OutboxRecord[]> {
  const records = await run<OutboxRecord[]>(RECORDS, "readonly", (store) =>
    store.index("bySpace").getAll(spaceId)
  );
  return records.sort((a, b) => a.seq - b.seq);
}

export async function deleteRecord(id: string): Promise<void> {
  await run(RECORDS, "readwrite", (store) => store.delete(id));
}

/**
 * The next sequence number for this device.
 *
 * Derived from the highest one on disk rather than a counter in memory, so it
 * survives a reload mid-shift. A gap after a record is deleted is harmless —
 * only the ordering matters.
 */
export async function nextSeq(): Promise<number> {
  const keys = await run<number[]>(RECORDS, "readonly", (store) =>
    store.index("bySeq").getAllKeys() as IDBRequest<number[]>
  );
  return keys.length === 0 ? 1 : Math.max(...keys) + 1;
}

export async function setIdMapping(localId: string, serverId: string): Promise<void> {
  await run(ID_MAP, "readwrite", (store) => store.put(serverId, localId));
}

export async function getIdMap(): Promise<Map<string, string>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ID_MAP, "readonly");
    const store = tx.objectStore(ID_MAP);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    tx.oncomplete = () => {
      db.close();
      const keys = keysRequest.result as string[];
      const values = valuesRequest.result as string[];
      resolve(new Map(keys.map((key, i) => [key, values[i]])));
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/**
 * There is deliberately no "clear the outbox" here.
 *
 * Sign-out does not wipe it — it is refused while anything is unsynced (see
 * `hasUnsyncedWork`), and what remains afterwards is a record of sales that
 * *did* go through, which is worth keeping until it ages out. Records leave
 * one at a time: `deleteRecord` for an explicit human discard, and the drain's
 * own pruning of records already accepted by the server.
 *
 * A single call that empties the queue would be the easiest way to delete
 * money that has already changed hands, so it does not exist.
 */
