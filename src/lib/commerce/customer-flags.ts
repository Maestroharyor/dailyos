import type { EmailVerification } from "./customer-verification";

/**
 * What a customer row is missing, as flags the list card renders as chips.
 *
 * A pure function rather than JSX conditionals, because the interesting case is
 * the one that is easy to get wrong: a customer with no email at all is a
 * walk-in or POS record, not an unverified account, and flagging it would put a
 * warning on every row the counter staff ever created.
 */
export interface CustomerFlags {
  /** The email exists and has never been proved. */
  emailUnverified: boolean;
  /** No phone number on file. */
  missingPhone: boolean;
}

export function customerFlags(customer: {
  phone: string | null;
  /**
   * Undefined for a row that has not been through the server yet, which is
   * what an optimistic create puts in the cache. Absence means "say nothing",
   * the same as it used to mean when it was spelled "unknown": a warning chip
   * on a row nobody has evaluated is worse than no chip at all.
   */
  verification: EmailVerification | undefined;
}): CustomerFlags {
  return {
    // Only "unverified". "no-email" is a walk-in record, not a failed signup.
    emailUnverified: customer.verification === "unverified",
    missingPhone: !customer.phone?.trim(),
  };
}

export function hasAnyFlag(flags: CustomerFlags): boolean {
  return flags.emailUnverified || flags.missingPhone;
}
