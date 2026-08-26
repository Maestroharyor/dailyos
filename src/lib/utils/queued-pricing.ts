import { isUlid, ulidTime } from "@/lib/offline/ulid";

/**
 * What a sale rung offline may claim about its own price, and what it may not.
 *
 * The problem this exists for. An order queued at the till was priced against
 * the settings as they stood, printed, and paid for in cash. Repricing it at
 * sync makes the shop's record disagree with the paper in the customer's hand
 * over money that has already changed hands. So the receipt wins.
 *
 * The problem *that* creates. "This is a queued sale" is a claim the client
 * makes, and `createOrder` is reachable by any account with `edit_orders` —
 * a cashier's, not only the POS UI's. Believing it unconditionally would let
 * anyone with a till write their own discount and their own tax figure, and
 * call it an offline sync. That is not a hypothetical: undercharging a friend
 * and shaving the tax line are the two oldest reasons to want this.
 *
 * So each claim is bounded by something the server controls:
 *
 * - **The discount** is bounded by what the code's own terms are worth on this
 *   cart. Whether the code was still available an hour ago cannot be checked
 *   now and is taken on trust; what it was worth is in the discount row.
 * - **The tax** is bounded by whether the settings actually changed after the
 *   sale was rung. `CommerceSettings.updatedAt` is server-written, so a claim
 *   that the rate used to be different is only entertained when the rate
 *   really did move in the meantime.
 * - **Both** require a real ULID request id, because the sale time comes from
 *   it. A forged timestamp still cannot make `updatedAt` move.
 *
 * A claim that fails its bound does not fail the sale. The sale is recorded at
 * the server's own figure and the refusal is written where a merchant sees it:
 * the money already changed hands, and dropping the order would lose it.
 */

export interface QueuedPricingClaim {
  /** The client says this sale was rung offline and is only now syncing. */
  queuedOffline: boolean;
  /** The idempotency key, which is where the sale time comes from. */
  clientRequestId: string | null | undefined;
}

/** When the sale was rung, or null if the request id cannot say. */
export function saleTimeOf(claim: QueuedPricingClaim): Date | null {
  if (!claim.queuedOffline) return null;
  const id = claim.clientRequestId;
  if (!id || !isUlid(id)) return null;
  return new Date(ulidTime(id));
}

export interface Resolved {
  /** The figure to bill. */
  amount: number;
  /** What to record on the order, or null when nothing surprising happened. */
  note: string | null;
}

export interface QueuedDiscountInput extends QueuedPricingClaim {
  /** What the receipt says was taken off. */
  claimed: number;
  /** What re-validating the code right now gives; 0 when it no longer passes. */
  serverAmount: number;
  /** The most this code's terms could be worth on this cart. */
  ceiling: number;
  /** For the note, so a merchant can find the code. */
  code: string;
}

export function resolveQueuedDiscount({
  queuedOffline,
  clientRequestId,
  claimed,
  serverAmount,
  ceiling,
  code,
}: QueuedDiscountInput): Resolved {
  const saleTime = saleTimeOf({ queuedOffline, clientRequestId });

  // A fresh sale, or one that cannot say when it happened, is priced now. The
  // merchant is standing there and the total has not been agreed to yet.
  if (!saleTime) return { amount: serverAmount, note: null };

  // The code still gives the same answer. Nothing to say.
  if (claimed === serverAmount) return { amount: serverAmount, note: null };

  if (claimed > ceiling) {
    return {
      amount: serverAmount,
      note:
        `Receipt claimed ${claimed} off with code ${code}, which is more than ` +
        `that code can give on this order (${ceiling}). Recorded at ` +
        `${serverAmount} instead.`,
    };
  }

  return {
    amount: claimed,
    note:
      `Discount kept at ${claimed} from the printed receipt. Code ${code} ` +
      `re-checked at sync as ${serverAmount}.`,
  };
}

export interface QueuedTaxInput extends QueuedPricingClaim {
  /** The tax figure the receipt printed. */
  claimed: number;
  /** What the current settings charge on this order. */
  live: number;
  /** When the space's commerce settings were last written. */
  settingsUpdatedAt: Date | null | undefined;
}

export interface ResolvedTax {
  /**
   * The figure to bill, or undefined to let `computeOrderTotals` price it from
   * the live rate. Undefined rather than a number so the caller passes nothing
   * at all in the ordinary case and the live path stays untouched.
   */
  agreedTax: number | undefined;
  note: string | null;
}

export function resolveQueuedTax({
  queuedOffline,
  clientRequestId,
  claimed,
  live,
  settingsUpdatedAt,
}: QueuedTaxInput): ResolvedTax {
  const saleTime = saleTimeOf({ queuedOffline, clientRequestId });
  if (!saleTime) return { agreedTax: undefined, note: null };

  if (claimed === live) return { agreedTax: undefined, note: null };

  // The only honest reason a queued order's tax differs is that the rate moved
  // while it was waiting. If the settings have not been touched since the sale
  // was rung, there is no such reason, and the difference is the client's.
  const settingsMoved =
    settingsUpdatedAt != null && settingsUpdatedAt.getTime() > saleTime.getTime();

  if (!settingsMoved) {
    return {
      agreedTax: undefined,
      note:
        `Receipt claimed ${claimed} tax but the settings have not changed ` +
        `since this sale was rung. Recorded at ${live}.`,
    };
  }

  if (claimed < 0) {
    return {
      agreedTax: undefined,
      note: `Receipt claimed ${claimed} tax, which is not a figure. Recorded at ${live}.`,
    };
  }

  return {
    agreedTax: claimed,
    note:
      `Tax kept at ${claimed} from the printed receipt. Current settings ` +
      `would charge ${live}.`,
  };
}
