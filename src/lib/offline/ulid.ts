/**
 * ULIDs, used as idempotency keys and as the identity of an outbox record.
 *
 * A UUID would do for uniqueness alone. Two properties earn the extra code:
 *
 * - **Lexicographic order matches creation order.** The first 10 characters
 *   are the timestamp, so sorting the queue as strings sorts it by when the
 *   cashier did the thing. Sales replay in the order they were rung.
 * - **The tail is short and readable.** A provisional offline receipt prints
 *   the last four characters, and someone has to be able to read them off a
 *   piece of paper and find the order.
 *
 * Crockford's base32: no I, L, O or U, so nothing reads as a different
 * character across a counter.
 */

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

/** The largest timestamp 10 base32 characters can hold: 10889-08-02. */
export const MAX_ULID_TIME = 281474976710655;

function encodeTime(now: number): string {
  if (!Number.isFinite(now) || now < 0 || now > MAX_ULID_TIME) {
    throw new RangeError(`Cannot encode time ${now} as a ULID`);
  }
  let out = "";
  let time = Math.floor(now);
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[time % ENCODING_LEN] + out;
    time = Math.floor(time / ENCODING_LEN);
  }
  return out;
}

function encodeRandom(): string {
  // crypto.getRandomValues, not Math.random: these are identity keys, and two
  // tills minting the same one would merge two sales into one order.
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < RANDOM_LEN; i++) {
    // Modulo over 256 is very slightly biased towards the first 224 symbols.
    // Irrelevant at 16 characters of entropy for a per-device queue key.
    out += ENCODING[bytes[i] % ENCODING_LEN];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

const ULID_PATTERN = new RegExp(`^[${ENCODING}]{${TIME_LEN + RANDOM_LEN}}$`);

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value);
}

/**
 * The timestamp a ULID was minted at. Used to age outbox records and to date a
 * provisional receipt from its own reference.
 */
export function ulidTime(value: string): number {
  if (!isUlid(value)) {
    throw new TypeError(`Not a ULID: ${value}`);
  }
  let time = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    time = time * ENCODING_LEN + ENCODING.indexOf(value[i]);
  }
  return time;
}

/** The tail a provisional receipt prints, so a human can find the order. */
export function ulidSuffix(value: string, length = 4): string {
  return value.slice(-length);
}
