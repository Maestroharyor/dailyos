import type { ActionResponse } from "./action-response";

type ActionFn = (...args: never[]) => Promise<ActionResponse<unknown>>;

/**
 * Wraps a server action so that `success: false` responses
 * throw an error, causing React Query's `onError` to fire.
 * Preserves the original function's type signature for proper inference.
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
