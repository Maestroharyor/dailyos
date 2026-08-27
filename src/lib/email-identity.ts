// Which parts of a space's email configuration a passing test send actually
// proves. Split out of the server action so it can be tested directly: a
// "use server" module may only export async functions.

/**
 * Fields whose change invalidates a previous test send.
 *
 * Without this a merchant edits the from-address to a domain their provider has
 * not verified, every send starts failing, and the card still reads "verified".
 */
export const IDENTITY_FIELDS = [
  "provider",
  "fromName",
  "fromAddress",
  "resendApiKey",
  "smtpHost",
  "smtpPort",
  "smtpSecure",
  "smtpUsername",
  "smtpPassword",
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/**
 * Whether this write changes something a previous test send had proven.
 *
 * Compared against the stored row rather than tested for presence. The settings
 * card submits every field on every save, so presence alone made each save
 * clear a passing test: a merchant who pressed Save twice silently dropped back
 * to the platform sender while the card still showed green.
 *
 * The two encrypted secrets fall out of this correctly without a special case.
 * Fresh ciphertext never equals stored ciphertext, because encryptSecret picks
 * a random IV, so typing a credential always counts as a change. That is the
 * right answer regardless: we cannot tell whether it differs from the stored
 * one, and re-proving it is cheap. An untouched credential is omitted by the
 * card and so is never compared at all.
 */
export function unverifies(
  existing: Partial<Record<IdentityField, unknown>> | null,
  incoming: Partial<Record<IdentityField, unknown>>
): boolean {
  // Nothing has been proven about a configuration that does not exist yet.
  if (!existing) return false;
  return IDENTITY_FIELDS.some((field) => field in incoming && incoming[field] !== existing[field]);
}
