/**
 * What the outbox does with a write that failed.
 *
 * This is the safety model of the whole feature. A misclassification here does
 * not produce a bug report — it produces a completed sale that quietly ceases
 * to exist, or a duplicate order, and nobody finds out until the till is
 * counted.
 */

export type OutboxStatus = "pending" | "sending" | "failed" | "poison" | "done";

export type FailureClass =
  /** Transient. Back off and try again. */
  | "retry"
  /**
   * The session expired while the device was offline. Refresh and retry.
   *
   * This is the landmine. Supabase access tokens last about an hour and
   * refreshing one needs the network, so the *first* sync after any real
   * outage comes back 401. Treating that as poison would silently destroy
   * every completed sale in the queue.
   */
  | "auth"
  /** Deterministic. Trying again will fail the same way; a human must look. */
  | "poison";

/** Errors that mean "the request never reached a server". */
const NETWORK_MESSAGES = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
  "connection closed",
  "fetch failed",
  "the operation was aborted",
  "signal is aborted",
  "err_internet_disconnected",
];

/** Server responses that are worth trying again. */
const AUTH_MESSAGES = ["unauthorized", "not authenticated", "jwt expired", "session expired"];

/**
 * Deterministic refusals. The request reached the server, the server
 * understood it, and the answer will not change on a retry.
 */
const POISON_MESSAGES = [
  "invalid input",
  "not found",
  "forbidden",
  "permission",
  "already exists",
  "insufficient",
  "expired",
  "invalid",
];

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  return "";
}

export function classifyError(error: unknown, online = true): FailureClass {
  const message = messageOf(error);

  // Order matters. Auth is checked before poison because "unauthorized" also
  // contains no retryable words and would otherwise fall through to poison,
  // which is the failure mode that destroys sales.
  if (AUTH_MESSAGES.some((m) => message.includes(m))) return "auth";

  if (NETWORK_MESSAGES.some((m) => message.includes(m))) return "retry";

  // A 5xx is the server's problem, not the payload's.
  if (/\b5\d\d\b/.test(message) || message.includes("internal server error")) {
    return "retry";
  }

  // Offline, the request never reached a server, so no refusal it appears to
  // carry can be authoritative — the message is as likely to be the browser's
  // as anyone's. Nothing is poison while the device is offline.
  if (!online) return "retry";

  if (POISON_MESSAGES.some((m) => message.includes(m))) return "poison";

  // Online and unrecognised. Still retry, because the asymmetry is stark: a
  // needless retry costs one request, a wrong poison costs a completed sale.
  // MAX_ATTEMPTS is what stops this looping forever, and `failed` keeps the
  // record for a human rather than dropping it.
  return "retry";
}

/** Attempts before a record stops retrying on its own and waits for a human. */
export const MAX_ATTEMPTS = 8;

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 300_000;

/**
 * Exponential backoff with jitter, capped at five minutes.
 *
 * Jitter matters more than it looks: several tills in one shop come back onto
 * the same wifi at the same moment, and without it they would retry in lockstep
 * and hammer a connection that has only just recovered.
 */
export function backoffDelay(attempts: number, random = Math.random): number {
  const exponential = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts), MAX_DELAY_MS);
  // Full jitter over the lower half, so the delay still grows with attempts.
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export interface DispatchableRecord {
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
}

/**
 * Whether a record should go out now.
 *
 * `sending` is excluded deliberately: two tabs on one terminal is normal, and
 * a record already in flight must not be picked up by the other drainer.
 */
export function shouldDispatch(record: DispatchableRecord, now: number, online: boolean): boolean {
  if (!online) return false;
  if (record.status !== "pending") return false;
  if (record.attempts >= MAX_ATTEMPTS) return false;
  return record.nextAttemptAt <= now;
}

/**
 * Where a record lands after a failure.
 *
 * An `auth` failure never consumes an attempt and never poisons: the queue has
 * to survive being offline for longer than a token lasts, which is most
 * outages worth queuing for.
 */
export function nextStatusAfterFailure(failure: FailureClass, attempts: number): OutboxStatus {
  if (failure === "auth") return "pending";
  if (failure === "poison") return "poison";
  return attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
}

/**
 * What becomes of a record that was left mid-flight.
 *
 * `sending` is written before the request is awaited, so a tab that dies in
 * between — a crash, a force-close, an OS reclaiming a backgrounded kiosk —
 * strands the record in a status no future drain will ever pick up. Nobody is
 * told, the sale never reaches the server, and sign-out stays blocked on that
 * device forever.
 *
 * It is treated as one failed attempt rather than a free retry, so a record
 * that strands the tab every time it is dispatched still backs off and still
 * reaches `failed`, where a person can see it, instead of taking the terminal
 * down in a loop. Retrying at all is only safe because every dispatched write
 * carries a `clientRequestId`: a send that did reach the server before the tab
 * died comes back as the same row, not a second one.
 */
export function reclaimStranded<T extends DispatchableRecord>(
  record: T,
  now: number,
  random = Math.random
): T {
  const attempts = record.attempts + 1;
  return {
    ...record,
    status: nextStatusAfterFailure("retry", record.attempts),
    attempts,
    nextAttemptAt: now + backoffDelay(attempts, random),
  };
}
