// Which parts of a space's SMS configuration a passing test send actually
// proves. Split out of the server action so it can be tested directly: a
// "use server" module may only export async functions. Mirrors
// src/lib/email-identity.ts, including why.

/**
 * Fields whose change invalidates a previous test send.
 *
 * `senderId` and `apiKey` are the obvious ones. `apiBaseUrl` is here because
 * Termii issues it per account: pointing a verified configuration at a
 * different region is a different account, and nothing about the old test
 * proves the new one works.
 *
 * `useDndRoute` is here for a subtler reason. A sender ID can be approved for
 * the generic route and still be waiting on DND whitelisting, so a test that
 * passed on generic proves nothing about DND. Leaving it out would let a
 * merchant flip the route and keep a green badge over a channel that silently
 * fails to reach most Nigerian numbers.
 *
 * Deliberately absent: `notifyCustomer`, `notifyMerchant`, `merchantPhone`,
 * `merchantSmsSources`, `monthlyCapAmount`. Those change who gets messages, not
 * whether the account can send them, and clearing a verification because a
 * merchant reordered their alert preferences would be noise.
 */
export const SMS_IDENTITY_FIELDS = [
  "provider",
  "senderId",
  "apiBaseUrl",
  "apiKey",
  "useDndRoute",
] as const;

export type SmsIdentityField = (typeof SMS_IDENTITY_FIELDS)[number];

/**
 * Whether this write changes something a previous test send had proven.
 *
 * Compared against the stored row rather than tested for presence: the settings
 * card submits every field on every save, so presence alone would make each
 * save clear a passing test, and a merchant who pressed Save twice would
 * silently drop back to the platform sender with the card still showing green.
 *
 * The encrypted credential falls out of this correctly without a special case.
 * Fresh ciphertext never equals stored ciphertext because encryptSecret picks a
 * random IV, so typing a key always counts as a change — which is right, since
 * we cannot tell whether it differs, and re-proving it is cheap. An untouched
 * credential is omitted by the card and never compared at all.
 */
export function smsUnverifies(
  existing: Partial<Record<SmsIdentityField, unknown>> | null,
  incoming: Partial<Record<SmsIdentityField, unknown>>
): boolean {
  // Nothing has been proven about a configuration that does not exist yet.
  if (!existing) return false;
  return SMS_IDENTITY_FIELDS.some(
    (field) => field in incoming && incoming[field] !== existing[field]
  );
}
