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
  /** The email exists and no confirmed auth user matches it. */
  emailUnverified: boolean;
  /** No phone number on file. */
  missingPhone: boolean;
}

export function customerFlags(customer: {
  phone: string | null;
  verification: EmailVerification;
}): CustomerFlags {
  return {
    // "unknown" is the degraded read, not a negative result. Claiming someone
    // is unverified because a query failed is worse than saying nothing.
    emailUnverified: customer.verification === "unverified",
    missingPhone: !customer.phone?.trim(),
  };
}

export function hasAnyFlag(flags: CustomerFlags): boolean {
  return flags.emailUnverified || flags.missingPhone;
}
