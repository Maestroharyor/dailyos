import { isUlid, ULID_ALPHABET, ulidSuffix, ulidTime } from "./ulid";

/**
 * The reference a receipt prints for a sale rung while offline.
 *
 * `OFF-20260826-K7Q2`, the date, then the last four characters of the
 * request's ULID. Deliberately outside the `ORD-` namespace, because the real
 * order number is assigned by `generateOrderNumber` when the sale syncs and
 * nothing else may look like one. A customer holding an `OFF-` receipt is
 * holding a sale that has happened but has not reached the server yet, and the
 * paper should say so.
 *
 * Two offline terminals cannot collide on a number, because neither one ever
 * picks a number.
 */

const PREFIX = "OFF";
const SUFFIX_LEN = 4;

export function provisionalOrderNumber(clientRequestId: string): string {
  if (!isUlid(clientRequestId)) {
    throw new TypeError(`Not a ULID: ${clientRequestId}`);
  }
  const date = new Date(ulidTime(clientRequestId));
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
  return `${PREFIX}-${stamp}-${ulidSuffix(clientRequestId, SUFFIX_LEN)}`;
}

// Built from the ULID alphabet rather than a hand-written character class, so
// the two cannot drift. A literal range is easy to get subtly wrong here:
// Crockford's base32 omits I, L, O and U, and `A-Z` would accept all four.
const SUFFIX_PATTERN = `[${ULID_ALPHABET}]{${SUFFIX_LEN}}`;
const PROVISIONAL_PATTERN = new RegExp(`^${PREFIX}-(\\d{8})-(${SUFFIX_PATTERN})$`);
const BARE_SUFFIX_PATTERN = new RegExp(`^${SUFFIX_PATTERN}$`);

export function isProvisionalOrderNumber(value: string): boolean {
  return PROVISIONAL_PATTERN.test(value);
}

/**
 * Whether a search string is four characters that could be a receipt tail on
 * their own, without the rest of the reference around them.
 *
 * A merchant reading `OFF-20260826-K7Q2` off a receipt over the phone usually
 * gets told the last bit, so the tail alone has to work as a search.
 */
export function isProvisionalSuffix(value: string): boolean {
  return BARE_SUFFIX_PATTERN.test(value.trim().toUpperCase());
}

/**
 * The four characters an order can be searched by once it has synced and taken
 * a real `ORD-` number. The paper in the customer's hand is the only link
 * between the two, so the merchant has to be able to type what is on it.
 */
export function provisionalSearchKey(value: string): string | null {
  const match = PROVISIONAL_PATTERN.exec(value.trim().toUpperCase());
  return match ? match[2] : null;
}
