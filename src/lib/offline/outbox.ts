"use client";

import { onlineManager } from "@tanstack/react-query";
import { resolveIdRefs, UnresolvedIdError } from "./id-map";
import {
  deleteRecord,
  getIdMap,
  getRecord,
  isOutboxAvailable,
  listRecords,
  nextSeq,
  type OutboxEntity,
  type OutboxRecord,
  putRecord,
  setIdMapping,
} from "./outbox-db";
import { orderOutbox } from "./outbox-order";
import {
  backoffDelay,
  classifyError,
  nextStatusAfterFailure,
  reclaimStranded,
  shouldDispatch,
} from "./outbox-policy";
import { ulid } from "./ulid";

/**
 * The queue of writes waiting to reach the server, and the loop that drains it.
 *
 * The rules live in the pure modules next door; this file is the plumbing that
 * applies them. Two things here are load-bearing and worth reading carefully:
 *
 * - **The drain holds a Web Lock.** Two POS tabs on one terminal is normal, and
 *   two drainers picking up the same record is a duplicate-order generator.
 *   The lock is what makes that impossible rather than unlikely.
 * - **A record for an order is never deleted automatically.** Not on poison,
 *   not at the attempt cap, not on a wipe. Only an explicit human discard.
 *   A queued sale is money that has already changed hands.
 */

const LOCK_NAME = "dailyos-outbox";

/** How a queued write is actually sent. Registered by the hook that owns it. */
export type Dispatcher = (record: OutboxRecord) => Promise<{ id?: string } | undefined>;

const dispatchers = new Map<string, Dispatcher>();

/** `entity:action`, e.g. `order:create`. */
export function registerDispatcher(key: string, dispatcher: Dispatcher): void {
  dispatchers.set(key, dispatcher);
}

const listeners = new Set<() => void>();

/**
 * A synchronous view of the queue, so React can read it with
 * `useSyncExternalStore` instead of an effect that setStates itself.
 *
 * IndexedDB is asynchronous and React's external-store contract is not, so the
 * snapshot is kept here and refreshed whenever the queue changes. The array
 * identity only changes when the contents do, which is what stops
 * `useSyncExternalStore` from looping.
 */
const EMPTY: OutboxRecord[] = [];
const snapshots = new Map<string, OutboxRecord[]>();

export function getOutboxSnapshot(spaceId: string): OutboxRecord[] {
  return snapshots.get(spaceId) ?? EMPTY;
}

export function subscribeToOutbox(spaceId: string, listener: () => void): () => void {
  listeners.add(listener);
  void refreshSnapshot(spaceId);
  return () => {
    listeners.delete(listener);
  };
}

async function refreshSnapshot(spaceId: string): Promise<void> {
  if (!spaceId || !isOutboxAvailable()) return;
  const records = await listRecords(spaceId);
  const previous = snapshots.get(spaceId);
  if (previous && sameRecords(previous, records)) return;
  snapshots.set(spaceId, records);
  for (const listener of listeners) listener();
}

function sameRecords(a: OutboxRecord[], b: OutboxRecord[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((record, i) => {
    const other = b[i];
    return (
      record.id === other.id &&
      record.status === other.status &&
      record.attempts === other.attempts &&
      record.lastError === other.lastError &&
      record.serverId === other.serverId
    );
  });
}

/** Every known space is refreshed: a drain can change more than one. */
function notify(): void {
  for (const spaceId of new Set([...snapshots.keys(), lastTouchedSpaceId].filter(Boolean))) {
    void refreshSnapshot(spaceId as string);
  }
}

let lastTouchedSpaceId: string | undefined;

export interface EnqueueInput {
  /**
   * A ULID minted by the caller. It is the record's identity *and* the
   * `clientRequestId` the server sees, so the caller has to know it before
   * building the payload — which is why it is passed in rather than generated
   * here.
   */
  id?: string;
  spaceId: string;
  userId: string;
  entity: OutboxEntity;
  action: string;
  payload: unknown;
  /** Set when this write creates something other queued writes point at. */
  localId?: string;
}

/**
 * Put a write on the queue. The record's id is also the `clientRequestId` the
 * server will see, so a record dispatched twice lands on one row.
 */
export async function enqueue(input: EnqueueInput): Promise<OutboxRecord> {
  const record: OutboxRecord = {
    id: input.id ?? ulid(),
    seq: await nextSeq(),
    spaceId: input.spaceId,
    userId: input.userId,
    entity: input.entity,
    action: input.action,
    payload: input.payload,
    localId: input.localId,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  };
  await putRecord(record);
  lastTouchedSpaceId = input.spaceId;
  notify();
  void drain(input.spaceId);
  return record;
}

export async function listOutbox(spaceId: string): Promise<OutboxRecord[]> {
  if (!isOutboxAvailable()) return [];
  return listRecords(spaceId);
}

export async function countUnsynced(spaceId: string): Promise<number> {
  const records = await listOutbox(spaceId);
  return records.filter((r) => r.status !== "done").length;
}

/**
 * Whether signing out would strand work. The sign-out flow refuses while this
 * is true: the next person to use the terminal cannot sync the last one's
 * sales, because the queue is scoped to the user who rang them.
 */
export async function hasUnsyncedWork(spaceId: string): Promise<boolean> {
  return (await countUnsynced(spaceId)) > 0;
}

/**
 * Retry a record a human has looked at. Clears the attempt count, because the
 * cap exists to stop a machine looping, not to stop a person trying again.
 */
export async function retryRecord(id: string): Promise<void> {
  const record = await getRecord(id);
  if (!record) return;
  await putRecord({ ...record, status: "pending", attempts: 0, nextAttemptAt: 0 });
  notify();
  void drain(record.spaceId);
}

/**
 * Explicit human discard. The only path that removes a record, and the reason
 * nothing else does: discarding a queued order throws away a sale that already
 * happened at the counter.
 */
export async function discardRecord(id: string): Promise<void> {
  await deleteRecord(id);
  notify();
}

/**
 * How long a synced record is kept.
 *
 * Long enough that a merchant looking into "did that sale from Tuesday go
 * through?" can still see it, short enough that IndexedDB does not grow for
 * the life of the terminal. Only `done` records are pruned — nothing that
 * failed, and nothing still waiting, is ever removed automatically.
 */
const KEEP_SYNCED_MS = 7 * 24 * 60 * 60 * 1000;

async function pruneSynced(spaceId: string): Promise<void> {
  const cutoff = Date.now() - KEEP_SYNCED_MS;
  const records = await listRecords(spaceId);
  const stale = records.filter((record) => record.status === "done" && record.createdAt < cutoff);
  for (const record of stale) {
    await deleteRecord(record.id);
  }
}

let draining = false;

/**
 * Send everything that is ready, in order, stopping at the first record that
 * cannot go.
 *
 * Stopping rather than skipping is deliberate. The queue is a sequence of
 * things one person did, and dispatching later writes past a stuck earlier one
 * reorders the shop's history for no benefit.
 */
export async function drain(spaceId: string): Promise<void> {
  if (!isOutboxAvailable()) return;
  if (!onlineManager.isOnline()) return;
  await exclusively(async () => {
    await drainOnce(spaceId);
  });
}

/**
 * Bring the queue back to a truthful state after a crash, and tell the UI.
 *
 * Separate from `drain` because it has to run while offline too. A tab killed
 * mid-send leaves a record at `sending`, which no drain will ever pick up and
 * which blocks sign-out on that terminal; if the shop's wifi is still down
 * when the cashier reopens the app, waiting for a drain to fix it means
 * waiting for the outage to end. This runs on mount either way.
 */
export async function recoverStranded(spaceId: string): Promise<void> {
  if (!isOutboxAvailable()) return;
  await exclusively(async () => {
    await reclaimStrandedRecords(await listRecords(spaceId));
  });
}

/**
 * Run something with sole access to the queue.
 *
 * Web Locks makes single-drainer a guarantee rather than a hope: two POS tabs
 * on one terminal is normal, and two drainers picking up the same record is a
 * duplicate-order generator. Where it is missing (older Safari), the
 * in-process flag still stops one tab overlapping with itself, and the
 * server's clientRequestId is what stops two tabs producing two orders.
 *
 * `ifAvailable` rather than queuing: if another tab holds the lock it is
 * already doing this work, and a second pass behind it would find nothing.
 */
async function exclusively(work: () => Promise<void>): Promise<void> {
  if (draining) return;

  const guarded = async () => {
    draining = true;
    try {
      await work();
    } finally {
      draining = false;
      notify();
    }
  };

  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await guarded();
    });
  } else {
    await guarded();
  }
}

async function drainOnce(spaceId: string): Promise<void> {
  await pruneSynced(spaceId);

  const records = await reclaimStrandedRecords(await listRecords(spaceId));
  const idMap = await getIdMap();
  const { ready, deadlocked } = orderOutbox(
    records.map((r) => ({ ...r, payload: r.payload })),
    new Set(idMap.keys())
  );

  // A record whose dependency was refused or discarded can never go. Left as
  // "pending" it would sit on the sync screen saying "waiting" forever, which
  // is the worst of both worlds: nothing happens and nobody is told. Move it
  // to failed so it surfaces where a person can act on it.
  for (const record of deadlocked) {
    if (record.status !== "pending") continue;
    await putRecord({
      ...(record as OutboxRecord),
      status: "failed",
      lastError:
        "Waiting on something that was refused or discarded, so this can no longer be sent.",
    });
  }
  if (deadlocked.length > 0) notify();

  const now = Date.now();
  for (const record of ready) {
    if (!onlineManager.isOnline()) return;
    if (!shouldDispatch(record, now, true)) continue;

    const stop = await dispatchOne(record as OutboxRecord, idMap);
    if (stop) return;
  }
}

/**
 * Take back anything a dead tab left mid-flight.
 *
 * Runs inside the drain lock, so nothing found here can still be in the air:
 * Web Locks guarantees no other drainer is live anywhere in the origin. See
 * `reclaimStranded` for why re-sending is the safe answer.
 */
async function reclaimStrandedRecords(records: OutboxRecord[]): Promise<OutboxRecord[]> {
  if (!records.some((r) => r.status === "sending")) return records;

  const now = Date.now();
  const reclaimed = await Promise.all(
    records.map(async (record) => {
      if (record.status !== "sending") return record;
      const next: OutboxRecord = {
        ...reclaimStranded(record, now),
        lastError: "The app closed before this finished sending. Trying again.",
      };
      await putRecord(next);
      return next;
    })
  );
  notify();
  return reclaimed;
}

/** Returns true when the drain should stop rather than move to the next record. */
async function dispatchOne(record: OutboxRecord, idMap: Map<string, string>): Promise<boolean> {
  const dispatcher = dispatchers.get(`${record.entity}:${record.action}`);
  if (!dispatcher) {
    // A record whose handler is not registered — an older app version wrote it,
    // or the page holding the hook has not mounted. Not poison: leave it.
    return false;
  }

  let payload: unknown;
  try {
    payload = resolveIdRefs(record.payload, idMap);
  } catch (error) {
    if (error instanceof UnresolvedIdError) {
      // Its dependency has not synced. orderOutbox should have caught this;
      // if it did not, waiting is still the right answer.
      return true;
    }
    throw error;
  }

  await putRecord({ ...record, status: "sending" });
  notify();

  try {
    const result = await dispatcher({ ...record, payload });

    if (record.localId && result?.id) {
      await setIdMapping(record.localId, result.id);
      idMap.set(record.localId, result.id);
    }

    await putRecord({
      ...record,
      payload,
      status: "done",
      serverId: result?.id,
      lastError: undefined,
    });
    notify();
    return false;
  } catch (error) {
    const failure = classifyError(error, onlineManager.isOnline());
    const attempts = failure === "auth" ? record.attempts : record.attempts + 1;
    const status = nextStatusAfterFailure(failure, record.attempts);

    await putRecord({
      ...record,
      status,
      attempts,
      nextAttemptAt: Date.now() + backoffDelay(attempts),
      lastError: error instanceof Error ? error.message : String(error),
    });
    notify();

    // Stop the drain on anything but a clean success. Later records in the
    // queue are almost always behind this one in the shop's own sequence.
    return true;
  }
}
