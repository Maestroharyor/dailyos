import { prisma } from "@/lib/db";

/**
 * Whether a customer's email address has been confirmed.
 *
 * Read from `auth.users.email_confirmed_at` rather than stored on the Customer
 * row. An earlier design added a `Customer.emailVerifiedAt` column stamped by
 * the storefront on a successful verification; it was dropped because it can
 * only ever under-report. The stamp is keyed by email, exactly as this read is,
 * so it inherits the same lossiness it was meant to justify, and any
 * verification path nobody remembers to instrument (a merchant confirming from
 * the Supabase dashboard, a provider that auto-confirms, anything added later)
 * leaves it null on an account that is genuinely verified. This read cannot.
 *
 * `auth` is not in the Prisma schema and is not managed by it, so this is a raw
 * query. `email_confirmed_at` is a stable part of GoTrue's public surface.
 *
 * Three states, not two. `Customer.email` is nullable, because walk-in and POS
 * customers are recorded without one, and flagging the counter staff's own
 * records as "not verified" is the obvious wrong answer.
 */
export type EmailVerification = "verified" | "unverified" | "no-email" | "unknown";

interface CustomerEmail {
  id: string;
  email: string | null;
}

/**
 * Set to true once a permission failure has been logged, so a role that cannot
 * read the auth schema produces one line rather than one per page view.
 */
let authReadDenied = false;

/**
 * Look up confirmation state for a page of customers in one query.
 *
 * Returns a map keyed by customer id. A customer with no email is absent from
 * the map; so is every customer when the lookup itself fails, which is the
 * degraded path: callers render no badge at all rather than claiming everyone
 * is unverified. Getting that backwards would put a red flag on every row in
 * the table the first time a database role changed.
 */
export async function verificationByCustomerId(
  customers: CustomerEmail[]
): Promise<Map<string, EmailVerification>> {
  const byId = new Map<string, EmailVerification>();

  const withEmail = customers.filter((customer): customer is CustomerEmail & { email: string } =>
    Boolean(customer.email?.trim())
  );
  for (const customer of customers) {
    if (!customer.email?.trim()) byId.set(customer.id, "no-email");
  }
  if (withEmail.length === 0) return byId;

  // Lowercased on both sides. The storefront routes normalise addresses, but
  // the merchant-side create and update do not, so a customer typed into the
  // dashboard can carry mixed case while GoTrue stores its own lowercased.
  const emails = [...new Set(withEmail.map((customer) => customer.email.toLowerCase()))];

  let confirmed: Set<string>;
  try {
    const rows = await prisma.$queryRaw<{ email: string; email_confirmed_at: Date | null }[]>`
      SELECT lower(email) AS email, email_confirmed_at
      FROM auth.users
      WHERE lower(email) = ANY(${emails})
    `;
    confirmed = new Set(
      rows.filter((row) => row.email_confirmed_at !== null).map((row) => row.email)
    );
  } catch (error) {
    // The realistic failure is a runtime role without USAGE on the auth schema.
    // Degrade to "unknown" so the page still renders and simply shows no
    // verification badge, rather than failing the whole customers list over a
    // decoration.
    if (!authReadDenied) {
      authReadDenied = true;
      console.error("[customer-verification] could not read auth.users, badges disabled", error);
    }
    for (const customer of withEmail) byId.set(customer.id, "unknown");
    return byId;
  }

  for (const customer of withEmail) {
    byId.set(customer.id, confirmed.has(customer.email.toLowerCase()) ? "verified" : "unverified");
  }
  return byId;
}

/** Test seam, so one test's degraded path does not silence the next one's. */
export function __resetVerificationLogging(): void {
  authReadDenied = false;
}
