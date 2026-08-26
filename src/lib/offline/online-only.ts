import { onlineManager } from "@tanstack/react-query";

/**
 * The writes that cannot be queued, and the one way to refuse them.
 *
 * Most of commerce can wait: a sale, a customer, a stock adjustment all
 * describe something that already happened in the shop, and replaying them
 * later is honest. These do not. Each one either reads state the device cannot
 * see, or produces a value only the server can mint:
 *
 * - **Discount codes.** Validating one needs the live `usageCount` and this
 *   customer's order history. A code that was on its last use an hour ago is
 *   spent by now, and honouring it offline means discounting a sale the
 *   merchant did not agree to.
 * - **Commerce settings.** The tax rate is priced into every queued order. A
 *   device that changes it while offline reprices work that has already been
 *   rung up and printed.
 * - **Storefront connect, disconnect, regenerate.** These mint a key. There is
 *   no local answer, and a placeholder is a secret that does not work.
 *
 * The manual discount field stays enabled offline: `createOrder` takes an
 * amount verbatim when no code is attached, so a merchant taking money off at
 * the counter is deciding something they are entitled to decide.
 */
export class OfflineUnavailableError extends Error {
  constructor(what: string) {
    super(`${what} needs a connection. This one can't be done offline.`);
    this.name = "OfflineUnavailableError";
  }
}

/**
 * Throw if the device is offline. Called from inside a `mutationFn`, not
 * wrapped around one — a wrapper collapses the mutation's variables type and
 * `useMutation` stops inferring what its callers pass.
 *
 * `onlineManager` rather than `navigator.onLine`, which reports true on a
 * captive portal and a dead uplink: exactly the flaky case this is for. The
 * heartbeat keeps the manager honest.
 */
export function requireOnline(what: string): void {
  if (!onlineManager.isOnline()) {
    throw new OfflineUnavailableError(what);
  }
}

/**
 * Whether a thrown value is this refusal, for a caller that wants to say
 * something other than the default.
 */
export function isOfflineUnavailable(error: unknown): boolean {
  return error instanceof OfflineUnavailableError;
}
