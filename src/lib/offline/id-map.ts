/**
 * Rewriting the placeholder ids a queued write is holding.
 *
 * Create a customer while offline and the browser invents an id for it,
 * `local-01ARZ3…`, because the sale rung thirty seconds later has to point at
 * *something*. When the customer create finally syncs, the server assigns the
 * real id, and every queued write still carrying the placeholder has to be
 * rewritten before it is dispatched.
 *
 * This matters more than it sounds: `OrderItem.productId` is `onDelete:
 * Restrict`, and `Order.customerId` is a real foreign key. Dispatching a
 * payload with a `local-` id in it is not a soft failure, it is a rejected
 * write on a sale that has already happened.
 */

const LOCAL_PREFIX = "local-";

export function localId(id: string): string {
  return `${LOCAL_PREFIX}${id}`;
}

export function isLocalId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(LOCAL_PREFIX);
}

/** Placeholder id -> the id the server assigned once the create synced. */
export type IdMap = ReadonlyMap<string, string>;

export class UnresolvedIdError extends Error {
  constructor(readonly unresolved: string[]) {
    super(`Unresolved local ids: ${unresolved.join(", ")}`);
    this.name = "UnresolvedIdError";
  }
}

/**
 * Replace every `local-` id in a payload with its real one.
 *
 * Walks the whole structure rather than a list of known fields, because the
 * fields that carry ids are not in one place, `customerId` at the top,
 * `items[n].productId` and `items[n].variantId` nested, and more will be added
 * by whoever adds the next entity.
 *
 * **Throws rather than dispatching a half-rewritten payload.** A placeholder
 * that has no mapping means the create it depends on has not synced, and
 * sending the write anyway would push a fake id at a foreign key. The caller
 * leaves the record queued and tries again after the dependency lands.
 */
export function resolveIdRefs<T>(payload: T, idMap: IdMap): T {
  const unresolved = new Set<string>();
  const resolved = walk(payload, idMap, unresolved);
  if (unresolved.size > 0) {
    throw new UnresolvedIdError([...unresolved]);
  }
  return resolved as T;
}

/** The placeholders a payload is still waiting on, without throwing. */
export function pendingIdRefs(payload: unknown): string[] {
  const found = new Set<string>();
  collect(payload, found);
  return [...found];
}

function walk(value: unknown, idMap: IdMap, unresolved: Set<string>): unknown {
  if (isLocalId(value)) {
    const real = idMap.get(value);
    if (real === undefined) {
      unresolved.add(value);
      return value;
    }
    return real;
  }

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, idMap, unresolved));
  }

  // Plain objects only. A Date or a Map in a payload is data, not a container
  // to rewrite, and copying one field-by-field would quietly destroy it.
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = walk(item, idMap, unresolved);
    }
    return out;
  }

  return value;
}

function collect(value: unknown, found: Set<string>): void {
  if (isLocalId(value)) {
    found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, found);
    return;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) collect(item, found);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
