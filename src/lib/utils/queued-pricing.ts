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
 * - **The tax** is not claimable at all. See `describeTaxVariance`.
 * - **Both** require a real ULID request id, and one whose timestamp is
 *   plausible: not in the future, and not older than the outbox keeps records.
 *   The id is client-minted, so its embedded time is a claim like any other.
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

/**
 * How far back a queued sale may plausibly reach.
 *
 * Matches how long the outbox keeps a record: anything older than this would
 * have been pruned from the device long before it could sync, so a claim to be
 * older is not a sale that could still be arriving.
 */
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Allowance for a till whose clock is a little ahead of the server's. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * When the sale was rung, or null if the request id cannot credibly say.
 *
 * `isUlid` checks the shape of the string, not the sanity of the time inside
 * it, and that time is minted on the device. Nothing here treats it as proof —
 * it is only ever used to decide whether the receipt-wins path applies at all,
 * and every claim that path allows is bounded by something else. The window
 * exists so a plainly impossible receipt (dated next year, or last decade) is
 * not entertained in the first place.
 */
export function saleTimeOf(claim: QueuedPricingClaim, now = Date.now()): Date | null {
  if (!claim.queuedOffline) return null;
  const id = claim.clientRequestId;
  if (!id || !isUlid(id)) return null;

  const rungAt = ulidTime(id);
  if (rungAt > now + CLOCK_SKEW_MS) return null;
  if (rungAt < now - MAX_QUEUE_AGE_MS) return null;

  return new Date(rungAt);
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

export interface TaxVarianceInput extends QueuedPricingClaim {
  /** The tax figure the receipt printed. */
  claimed: number;
  /** What the current settings charge on this order. */
  live: number;
}

/**
 * A queued order's tax is always the server's figure. This only says so.
 *
 * The discount above can be honoured because it is *checkable*: the code's
 * terms are in the database, so "the receipt says 500 off" is a claim the
 * server can bound. Tax has no equivalent. Verifying "the rate used to be
 * 7.5%" would need a rate history the schema does not keep, and without one
 * every route to honouring the claim reduces to trusting a number the client
 * chose — including trusting the sale time, which is minted on the device and
 * can be backdated to whenever suits.
 *
 * That trade is not worth taking. The case it would serve is a merchant
 * changing their tax rate *during* an outage, which settings being blocked
 * offline already makes rare and outages lasting minutes makes rarer. The case
 * it would open is a cashier shaving the tax line off a sale and calling it a
 * sync. So the order is priced from live settings and the difference is
 * written onto it, where a merchant can see it and reconcile rather than
 * having it silently applied.
 *
 * Worth revisiting the day `CommerceSettings` records what the rate used to be
 * and when it changed. Then the claim becomes checkable, and this becomes a
 * comparison instead of a refusal.
 */
export function describeTaxVariance({
  queuedOffline,
  clientRequestId,
  claimed,
  live,
}: TaxVarianceInput): string | null {
  if (!saleTimeOf({ queuedOffline, clientRequestId })) return null;
  if (claimed === live) return null;

  return (
    `Receipt printed ${claimed} tax; recorded at ${live} from current ` +
    `settings. Check whether the rate changed while this sale was queued.`
  );
}
