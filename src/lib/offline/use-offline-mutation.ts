"use client";

import { useMutation, onlineManager, type UseMutationOptions } from "@tanstack/react-query";
import { classifyError } from "./outbox-policy";
import { enqueue, type EnqueueInput } from "./outbox";
import { localId } from "./id-map";
import { ulid } from "./ulid";
import type { OutboxEntity } from "./outbox-db";

/**
 * A mutation that survives a dead network by queuing instead of failing.
 *
 * **This is not `wrapAction`, and that is a deliberate choice.** `wrapAction`
 * looks like the perfect chokepoint — one function, every mutation hook for
 * free — and it is the wrong place. It has no entity or space semantics, it is
 * shared with finance and mealflow, and its callers read the result
 * synchronously: `handleAddCustomer` in the POS does `result.data.id`. A
 * fabricated success there produces a real sale with a broken `customerId`.
 *
 * So the queuing lives here, opt-in per hook, where the caller has said what
 * the write is and what a local stand-in for its result looks like.
 *
 * Every existing `onMutate` / `onError` / `onSettled` body is untouched: this
 * wraps `useMutation`, it does not replace it.
 */

export interface OfflineMutationOptions<TVariables, TResult, TContext = unknown>
  extends Omit<
    UseMutationOptions<TResult, Error, TVariables, TContext>,
    "mutationFn" | "onMutate"
  > {
  mutationFn: (variables: TVariables) => Promise<TResult>;
  /**
   * `useMutation`'s `onMutate`, plus the placeholder id this write will use if
   * it ends up queued.
   *
   * Use it as the optimistic row's id. The two have to be the same value: the
   * optimistic row is what the rest of the app reads the entity back out of
   * the cache by, so a *different* id there means a later write referencing
   * this one carries an id the outbox has never heard of. `pendingIdRefs` and
   * `resolveIdRefs` both key on the `local-` prefix, so an id like
   * `temp-1756...` is invisible to the dependency ordering *and* to the
   * rewriting — the dependent write dispatches with a foreign key that does
   * not exist, and nothing points the merchant at what went wrong.
   */
  onMutate?: (
    variables: TVariables,
    placeholder: string
  ) => Promise<TContext> | TContext;
  spaceId: string;
  userId: string;
  entity: OutboxEntity;
  action: string;
  /**
   * The payload to queue. Defaults to the variables, but a hook can add the
   * `clientRequestId` or strip something that should not be replayed.
   */
  toPayload?: (variables: TVariables, requestId: string) => unknown;
  /**
   * A request id the caller has already minted.
   *
   * The POS mints one per sale so a retry keeps a single identity, and that id
   * is what the receipt's provisional reference is derived from. Without this,
   * the queue would mint a second one and the reference on the receipt would
   * not match the reference on the sync screen — which breaks the one workflow
   * the provisional reference exists for.
   */
  requestIdOf?: (variables: TVariables) => string | undefined;
  /**
   * The result to hand back when the write was queued rather than sent.
   *
   * The caller reads this synchronously, so it has to be shaped like a real
   * response. `pending: true` is how a consumer tells the difference, and the
   * id it carries is a `local-` placeholder that later queued writes can point
   * at.
   */
  toLocalResult: (variables: TVariables, requestId: string, placeholder: string) => TResult;
  /** True when this write creates something other queued writes will reference. */
  createsEntity?: boolean;
}

/**
 * True when the write should be queued rather than reported as a failure:
 * either we already knew we were offline, or the failure looks like the
 * network rather than a refusal.
 */
function shouldQueue(error: unknown): boolean {
  const online = onlineManager.isOnline();
  if (!online) return true;
  return classifyError(error, online) === "retry";
}

/**
 * Request ids minted in `onMutate` and consumed by the queue moments later.
 *
 * Keyed by the variables object React Query hands to both, rather than a
 * single module-level slot, because two `.mutate()` calls can interleave their
 * awaits and a shared slot would give the second write the first one's id.
 */
const mintedIds = new WeakMap<object, string>();

export function requestIdFor<TVariables>(
  variables: TVariables,
  requestIdOf?: (variables: TVariables) => string | undefined
): string {
  // The caller's id wins when it has one. It is the clientRequestId the server
  // dedupes on *and* the thing the receipt's provisional reference is derived
  // from, so minting a second one here would print a reference that matches
  // nothing on the sync screen.
  const provided = requestIdOf?.(variables);
  if (provided) return provided;

  if (typeof variables === "object" && variables !== null) {
    const existing = mintedIds.get(variables);
    if (existing) return existing;
    const fresh = ulid();
    mintedIds.set(variables, fresh);
    return fresh;
  }

  // Nothing to key on. Only reachable for a mutation whose variables are a
  // bare string or number, which no create is.
  return ulid();
}

export function useOfflineMutation<TVariables, TResult, TContext = unknown>({
  mutationFn,
  spaceId,
  userId,
  entity,
  action,
  toPayload,
  requestIdOf,
  toLocalResult,
  createsEntity = false,
  onMutate,
  ...options
}: OfflineMutationOptions<TVariables, TResult, TContext>) {
  return useMutation<TResult, Error, TVariables, TContext>({
    ...options,
    onMutate: onMutate
      ? (variables: TVariables) =>
          onMutate(variables, localId(requestIdFor(variables, requestIdOf)))
      : undefined,
    mutationFn: async (variables: TVariables) => {
      const queueIt = async (): Promise<TResult> => {
        const record = await enqueueWrite({
          spaceId,
          userId,
          entity,
          action,
          variables,
          toPayload,
          requestIdOf,
          createsEntity,
        });
        return toLocalResult(variables, record.id, record.localId ?? record.id);
      };

      // Offline: do not even attempt. A dead socket costs the cashier the
      // fetch timeout for nothing, and the queue is where this is going anyway.
      if (!onlineManager.isOnline()) {
        return queueIt();
      }

      try {
        return await mutationFn(variables);
      } catch (error) {
        if (shouldQueue(error)) {
          return queueIt();
        }
        // A real refusal — invalid input, no permission. Queuing it would only
        // move the same rejection somewhere the cashier is less likely to see.
        throw error;
      }
    },
  });
}

async function enqueueWrite<TVariables>({
  spaceId,
  userId,
  entity,
  action,
  variables,
  toPayload,
  requestIdOf,
  createsEntity,
}: {
  spaceId: string;
  userId: string;
  entity: OutboxEntity;
  action: string;
  variables: TVariables;
  toPayload?: (variables: TVariables, requestId: string) => unknown;
  requestIdOf?: (variables: TVariables) => string | undefined;
  createsEntity: boolean;
}) {
  // The same id `onMutate` already used for the optimistic row.
  const requestId = requestIdFor(variables, requestIdOf);

  const input: EnqueueInput = {
    id: requestId,
    spaceId,
    userId,
    entity,
    action,
    payload: toPayload ? toPayload(variables, requestId) : variables,
    localId: createsEntity ? localId(requestId) : undefined,
  };

  return enqueue(input);
}
