-- Turn RLS on across the public schema, and give the storefront reader the
-- seventeen tables it actually needs.

-- The companion migration, 2026-08-30-revoke-anon-table-grants.sql, closes the
-- hole by taking the grants away. This is the second layer: with RLS on, a
-- stray GRANT in a future hand-applied migration is no longer enough on its own
-- to expose a table. Apply that migration first.
--
-- The failure mode to respect here is silence. vktbougie_reader has no
-- rolbypassrls, and RLS returns no rows rather than an error, so a table this
-- role reads that has no policy does not break loudly. It renders a blank page:
-- queries.ts:383 falls back to hardcoded branding, queries.ts:88 reports every
-- product out of stock, and email.ts:59 quietly sends merchant alerts to
-- ALERT_EMAILS alone. That is exactly how the delivery notes went missing.
--
-- The seventeen below are every table VKT reads, taken from each
-- db.<model>.<method> call in src/lib/server/{queries,email}.ts plus the five
-- reached only through productInclude and sale_event_products, which emit their
-- own statements and are separately subject to RLS. space_members and profiles
-- are there for the merchant alert recipient lookup, not for the storefront.
--
-- USING (true) rather than a spaceId predicate, matching the convention set by
-- 2026-08-30-delivery-rls-policies.sql: the application filters by spaceId on
-- every query, and six of the seventeen have no spaceId column of their own.
--
-- Least privilege arrives as a side effect. The reader currently holds SELECT
-- on all 53 tables, orders and customers included. After this it can reach
-- seventeen, without a single grant changing.
--
-- No FORCE: postgres and service_role hold rolbypassrls, so DailyOS and the
-- admin client are unaffected either way, and handle_new_user is SECURITY
-- DEFINER owned by postgres, so signup keeps writing profiles.
--
-- Safe on a live database: no data is read or written. Run against DIRECT_URL
-- (:5432), never the pooled DATABASE_URL (:6543).

BEGIN;

-- 1. RLS on every table in the schema. --------------------------------------
-- Idempotent: ENABLE on an already-enabled table is a no-op, so the five that
-- already have it (delivery_notes, healthcheck, order_status_history,
-- space_email_settings, store_pickup_settings) pass through untouched.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2. The seventeen tables the storefront reads. ------------------------------
-- delivery_notes and store_pickup_settings already carry this policy from
-- 2026-08-30-delivery-rls-policies.sql; the DROP makes re-running a no-op.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'product_images', 'product_variants', 'product_tags',
    'categories', 'inventory_items', 'inventory_movements', 'reviews',
    'sale_events', 'sale_event_products', 'commerce_settings',
    'delivery_zones', 'delivery_notes', 'store_pickup_settings',
    'spaces', 'space_members', 'profiles'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "storefront_reader_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "storefront_reader_select" ON public.%I FOR SELECT TO vktbougie_reader USING (true)', t);
  END LOOP;
END $$;

-- Fail the whole transaction rather than leave the storefront reading nothing.
DO $$
DECLARE
  unprotected int;
  covered int;
BEGIN
  SELECT count(*) INTO unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF unprotected <> 0 THEN
    RAISE EXCEPTION 'expected every public table to have RLS enabled, found % without', unprotected;
  END IF;

  SELECT count(*) INTO covered
    FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname = 'storefront_reader_select'
     AND 'vktbougie_reader' = ANY (roles::text[]);
  IF covered <> 17 THEN
    RAISE EXCEPTION 'expected 17 storefront reader policies, found %', covered;
  END IF;
END $$;

COMMIT;

-- Read back, as vktbougie_reader rather than as postgres, because postgres
-- bypasses RLS and would have reported success all along.
--   SELECT count(*) FROM "products";        -> the catalog, not 0
--   SELECT count(*) FROM "delivery_zones";  -> 96 per space
--   SELECT count(*) FROM "orders";          -> 0, and no error
--   SELECT count(*) FROM "customers";       -> 0, and no error
-- Then load the storefront: home, a category, a product, and checkout with a
-- Lagos and a Kebbi address. A blank-but-not-broken page is the failure to
-- watch for, not a stack trace.
