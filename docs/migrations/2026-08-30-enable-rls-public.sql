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
-- A policy is not enough for three of them, because RLS filters rows and not
-- columns. `spaces` holds storefrontKey - the very secret this pair of
-- migrations exists to stop leaking - so USING (true) would leave every space's
-- key readable by a role whose password lives in another application's
-- environment. Section 3 narrows those three to the columns the storefront
-- actually selects, which is a grant-level fix rather than a policy one.
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

-- 3. Column-level SELECT for the three tables holding more than the catalog. --
-- RLS restricts rows, never columns, so these need grants rather than policies.
-- The column lists are exactly what VKT selects, verified against each query:
--
--   spaces         queries.ts:376  select { name }      + id for the WHERE
--                  email.ts:39     select { ownerId }
--   profiles       email.ts:44     select { email }     where isSuperAdmin
--                  email.ts:53     select { email }     where id
--   space_members  email.ts:40     select { user.email } where spaceId/status/role
--                                  plus id, which Prisma selects to resolve the
--                                  relation, and userId, the key it joins on
--
-- storefrontKey is the point of the exercise. isSuperAdmin stays readable
-- because the alert lookup filters on it; name, slug, mode and every timestamp
-- go, since nothing reads them.
--
-- This fails loudly rather than silently, which is the rare direction for this
-- role: a future `db.space.findUnique` without a `select` clause asks for every
-- column and gets `permission denied`, not an empty result.
REVOKE SELECT ON public."spaces" FROM vktbougie_reader;
GRANT SELECT ("id", "name", "ownerId") ON public."spaces" TO vktbougie_reader;

REVOKE SELECT ON public."profiles" FROM vktbougie_reader;
GRANT SELECT ("id", "email", "isSuperAdmin") ON public."profiles" TO vktbougie_reader;

REVOKE SELECT ON public."space_members" FROM vktbougie_reader;
GRANT SELECT ("id", "spaceId", "userId", "status", "role") ON public."space_members" TO vktbougie_reader;

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

  IF has_column_privilege('vktbougie_reader', 'public.spaces', 'storefrontKey', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader can still read spaces.storefrontKey';
  END IF;
  IF NOT has_column_privilege('vktbougie_reader', 'public.spaces', 'name', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader lost spaces.name, which the brand lookup needs';
  END IF;
  IF NOT has_column_privilege('vktbougie_reader', 'public.profiles', 'email', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader lost profiles.email, which merchant alerts need';
  END IF;
END $$;

COMMIT;

-- Read back, as vktbougie_reader rather than as postgres, because postgres
-- bypasses RLS and would have reported success all along.
--   SELECT count(*) FROM "products";        -> the catalog, not 0
--   SELECT count(*) FROM "delivery_zones";  -> 96 per space
--   SELECT count(*) FROM "orders";          -> 0, and no error
--   SELECT count(*) FROM "customers";       -> 0, and no error
--   SELECT "name" FROM "spaces";            -> the space names
--   SELECT "storefrontKey" FROM "spaces";   -> permission denied, loudly
-- Then load the storefront: home, a category, a product, and checkout with a
-- Lagos and a Kebbi address. A blank-but-not-broken page is the failure to
-- watch for, not a stack trace.
