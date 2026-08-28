-- Order delivery lifecycle (feat/order-delivery-lifecycle).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL. Prefer this over `bun run db:push`, which is
-- blocked in this project by the cross-schema FK (public.profiles ->
-- auth.users) and errors with P4002.
--
-- Safe on a live database: every statement is additive or a guarded backfill.
-- Existing orders keep their status, and every read path already tolerates a
-- NULL shipping column because that is what pre-migration orders will have.
--
-- ORDER OF EXECUTION MATTERS. Postgres forbids *using* an enum value in the
-- same transaction that added it, and step 4 uses one. Run step 1 on its own
-- and let it commit before running the rest. Declaring a column of the type
-- (step 3) is not "using" it, so only the backfill is affected.


-- 1. Delivery states. -------------------------------------------------------
--
-- Positioned between `processing` and `completed` so that ORDER BY status and
-- the status-distribution report in commerce/reports read chronologically
-- rather than in the order the values happened to be added.
--
-- `completed` is kept and keeps its meaning: it is the terminal state for
-- walk-in and POS sales, which are handed over across a counter and never
-- shipped. `delivered` is the terminal state for a storefront order.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'shipped'          AFTER 'processing';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'out_for_delivery' AFTER 'shipped';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivered'        AFTER 'out_for_delivery';


-- 2. Per-order shipping snapshot. -------------------------------------------
--
-- The delivery address currently lives only on the customer row, so a second
-- order to a different address silently rewrites what the first order shows.
-- Once orders are tracked to a doorstep that is wrong, not just untidy.
-- These are written at order creation and never updated.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingName"    TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingAddress" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shippingPhone"   TEXT;

-- The Paystack transaction id, currently stringified into orders.notes along
-- with a JSON blob of figures that are all already real columns. This is the
-- one field in that blob with nowhere else to live.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentTransactionId" TEXT;

-- Supplied by the storefront from the shopper's Google/Supabase profile, so
-- the admin customer card can show a face instead of a generic glyph.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;


-- 3. Status history. --------------------------------------------------------
--
-- One row per transition, written in the same transaction as the status change
-- so a row can never disagree with orders.status. changedById is NULL for
-- system transitions (the Paystack webhook's pending -> confirmed upgrade).

CREATE TABLE IF NOT EXISTS "order_status_history" (
  "id"          TEXT NOT NULL,
  "orderId"     TEXT NOT NULL,
  "status"      "OrderStatus" NOT NULL,
  "note"        TEXT,
  "changedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_orderId_fkey'
  ) THEN
    ALTER TABLE "order_status_history"
      ADD CONSTRAINT "order_status_history_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "order_status_history_orderId_createdAt_idx"
  ON "order_status_history" ("orderId", "createdAt");


-- 4. Backfills. -------------------------------------------------------------
--
-- Both are approximations, stated plainly rather than presented as history.
--
-- 4a. The shipping snapshot copies the customer's *current* address, which is
--     the very thing these columns exist to stop relying on. It is right for
--     any customer who has ordered once and wrong for anyone who has moved.
--     Better than a blank order page, and it only ever runs once.

UPDATE "orders" o
SET "shippingName"    = COALESCE(o."shippingName",    c."name"),
    "shippingAddress" = COALESCE(o."shippingAddress", c."address"),
    "shippingPhone"   = COALESCE(o."shippingPhone",   c."phone")
FROM "customers" c
WHERE o."customerId" = c."id"
  AND o."source" = 'storefront'
  AND o."shippingAddress" IS NULL;

-- 4b. One history row per existing order, seeded from its current status and
--     createdAt. An order that moved pending -> confirmed -> completed gets a
--     single `completed` entry dated at creation, because the transitions were
--     never recorded and cannot be recovered. The tracker renders a step with
--     no entry as a label without a timestamp, so this degrades cleanly.

INSERT INTO "order_status_history" ("id", "orderId", "status", "note", "changedById", "createdAt")
SELECT
  'seed_' || o."id",
  o."id",
  o."status",
  'Backfilled at migration; earlier transitions were not recorded.',
  NULL,
  o."createdAt"
FROM "orders" o
WHERE NOT EXISTS (
  SELECT 1 FROM "order_status_history" h WHERE h."orderId" = o."id"
);
