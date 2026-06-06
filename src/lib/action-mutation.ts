import type { ActionResponse } from "./action-response";

type ActionFn = (...args: never[]) => Promise<ActionResponse<unknown>>;

/**
 * Wraps a server action so that `success: false` responses
 * throw an error, causing React Query's `onError` to fire.
 * Preserves the original function's type signature for proper inference.
 * Use for MUTATIONS (mutationFn).
 */
export function wrapAction<F extends ActionFn>(fn: F): F {
  return (async (...args: Parameters<F>) => {
    const result = await fn(...args);
    if (!result.success) {
      throw new Error(result.message);
    }
    return result;
  }) as F;
}

/**
 * Awaits a server action and returns its `data`, throwing on `success: false`.
 * The discriminated union narrows after the guard, so the result is non-null
 * (no cast needed). Use for READS (React Query `queryFn`):
 *   queryFn: () => unwrapAction(listProducts(spaceId, filters))
 */
export async function unwrapAction<R extends ActionResponse<unknown>>(
  promise: Promise<R>
): Promise<Extract<R, { success: true }>["data"]> {
  const res = await promise;
  if (!res.success) {
    throw new Error(res.message);
  }
  return res.data;
}
