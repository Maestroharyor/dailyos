-- Customer.emailVerifiedAt (feat/customer-email-verified-column).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL. Prefer this over `bun run db:push`, which is
-- blocked in this project by the cross-schema FK (public.profiles ->
-- auth.users) and errors with P4002.
--
-- Safe on a live database. Both statements are additive: a nullable column and
-- a backfill that only ever writes a non-NULL value over a NULL one.


-- 1. The column. ------------------------------------------------------------
--
-- Why this exists at all, given auth.users.email_confirmed_at is right there:
-- it is about to stop meaning anything. The Supabase project's "Confirm email"
-- setting is being turned off so storefront customers can sign in before
-- verifying, and GoTrue's autoconfirm path stamps email_confirmed_at at signup
-- for everyone. After the flip that column does not go quiet, it goes
-- uniformly true, which is worse than useless: it reports every account as
-- verified while looking authoritative.
--
-- This column is written only by POST /api/storefront/customers/verify-email,
-- which proves the identity from a verified access token rather than trusting
-- a request body or the storefront key.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);


-- 2. Backfill from the signal while it still means something. ---------------
--
-- Run this now, and RUN IT AGAIN immediately before turning "Confirm email"
-- off. It is correct at the moment it runs and goes stale afterwards: anyone
-- who verifies between this migration and the flip is only stamped if they
-- came through a route that calls the new endpoint. Re-running just before the
-- switch makes the column start the new regime equal to email_confirmed_at
-- rather than equal to it as of whenever this migration was applied.
--
-- Idempotent, and safe to run as many times as you like: the WHERE clause
-- means it never overwrites an existing stamp and never writes a NULL.
--
-- Matched on lower(email) because storefront routes normalise the address but
-- the merchant-side create and update do not, so a dashboard-entered address
-- can carry mixed case.

UPDATE "customers" c
SET    "emailVerifiedAt" = u.email_confirmed_at
FROM   auth.users u
WHERE  lower(c."email") = lower(u.email)
  AND  c."email" IS NOT NULL
  AND  u.email_confirmed_at IS NOT NULL
  AND  c."emailVerifiedAt" IS NULL;


-- 3. Index the lookup verification does on every confirmation. ---------------
--
-- POST /api/storefront/customers/verify-email stamps every Customer row whose
-- address matches the one the shopper just proved, across spaces rather than
-- only the calling one: the address was proved once and that proof is not
-- space-scoped.
--
-- That deliberately cannot use the (spaceId, email) unique index, because it
-- does not know the space, and the case-insensitive match rules out a plain
-- index on email as well. Without this it is a sequential scan over every
-- customer in the table on every OTP verification. Small today; it grows with
-- the customer table rather than with verification volume, which is the wrong
-- way round.
--
-- A functional index on lower(email) is what the planner needs, since that is
-- the expression the case-insensitive comparison comes down to.

CREATE INDEX IF NOT EXISTS "customers_email_lower_idx" ON "customers" (lower("email"));


-- 4. Check what it did. -----------------------------------------------------
--
-- Expect verified_customers to equal the number of customers whose address
-- matches a confirmed auth user. Customers with no email are legitimately
-- absent: walk-in and POS records are created without one.

SELECT count(*) FILTER (WHERE "emailVerifiedAt" IS NOT NULL) AS verified_customers,
       count(*) FILTER (WHERE "email" IS NULL)               AS no_email_customers,
       count(*)                                              AS total_customers
FROM   "customers";
