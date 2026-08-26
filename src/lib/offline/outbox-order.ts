import { isLocalId, pendingIdRefs } from "./id-map";
import type { OutboxStatus } from "./outbox-policy";

/**
 * The order queued writes go out in.
 *
 * Two rules, and the second is the one that is easy to get wrong:
 *
 * 1. A sale rung before another sale syncs before it. `seq` is monotonic per
 *    device, so this is just a sort.
 * 2. A write that references a `local-` id waits for the write that produces
 *    it. Ordering by `seq` alone almost gets this right — you create the
 *    customer before you ring the sale — but "almost" here means a rejected
 *    foreign key on a completed sale, so the dependency is explicit.
 *
 * A record blocked behind a poisoned dependency is held back rather than
 * dispatched. The customer create was refused; the order pointing at it cannot
 * succeed, and sending it would turn one problem into two.
 */

export interface OrderableRecord {
  id: string;
  seq: number;
  status: OutboxStatus;
  /** The placeholder id this record's create will resolve, if it makes one. */
  localId?: string;
  payload: unknown;
}

export interface OutboxOrdering<T extends OrderableRecord> {
  /** Ready to dispatch, in the order they should go. */
  ready: T[];
  /** Waiting on a dependency that has not synced yet. */
  blocked: T[];
  /** Waiting on a dependency that was refused and never will sync. */
  deadlocked: T[];
}

/**
 * Sort a queue into what can go now, what is waiting, and what is stuck.
 *
 * `resolved` holds the placeholders that already have real ids, so a record
 * whose dependency synced in an earlier drain is not treated as blocked.
 */
export function orderOutbox<T extends OrderableRecord>(
  records: T[],
  resolved: ReadonlySet<string>
): OutboxOrdering<T> {
  const bySeq = [...records].sort((a, b) => a.seq - b.seq);

  // Which record produces which placeholder, and whether it can still do so.
  const producer = new Map<string, T>();
  for (const record of bySeq) {
    if (record.localId) producer.set(record.localId, record);
  }

  const ready: T[] = [];
  const blocked: T[] = [];
  const deadlocked: T[] = [];

  // A placeholder counts as available once its producer is in `ready` for this
  // pass, so a customer create and the sale behind it can both go in one drain.
  const available = new Set(resolved);

  for (const record of bySeq) {
    // Only pending records are dispatch candidates. The rest are here for
    // context: a poisoned create still owns its placeholder, and a record that
    // has already gone out has already put its id into `resolved`.
    if (record.status !== "pending") continue;

    const refs = pendingIdRefs(record.payload).filter((ref) => !available.has(ref));

    if (refs.length === 0) {
      ready.push(record);
      if (record.localId) available.add(record.localId);
      continue;
    }

    // A dependency that was refused, or has no producer at all, will never
    // arrive. Nothing is gained by dispatching into a foreign key that cannot
    // resolve; surface it instead.
    const stuck = refs.some((ref) => {
      const source = producer.get(ref);
      return !source || source.status === "poison";
    });

    if (stuck) {
      deadlocked.push(record);
    } else {
      blocked.push(record);
    }
  }

  return { ready, blocked, deadlocked };
}

/**
 * Whether a record can produce a placeholder at all. Guards against a caller
 * setting `localId` to something that is not one, which would silently never
 * resolve.
 */
export function producesLocalId(record: OrderableRecord): boolean {
  return isLocalId(record.localId);
}
