-- Which order sources raise a "new order" email to the shop owner.
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL.
--
-- Additive, and the default reproduces the behaviour this ships with: every
-- source alerts the owner. Note that this is a *widening* — before it, the
-- owner alert fired only for storefront orders, because sendOrderEmails was
-- called from exactly one place. Orders created in the back office or at the
-- till sent nothing at all, to the owner or the customer.
--
-- No new table, so supabase/security.sql does not need re-running for this one.

ALTER TABLE "space_email_settings"
  ADD COLUMN IF NOT EXISTS "merchantEmailSources" "OrderSource"[] NOT NULL
    DEFAULT ARRAY['walk_in', 'pos', 'storefront', 'manual']::"OrderSource"[];
