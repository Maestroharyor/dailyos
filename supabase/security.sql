-- Public-schema access control that Prisma does NOT manage.
--
-- ⚠️ RE-APPLY THIS AFTER ANY DESTRUCTIVE `prisma db push`. Grants, default
-- privileges, RLS flags and policies live in the catalog, not in the Prisma
-- schema, so a push that drops and recreates a table brings it back RLS-off and
-- carrying Supabase's stock grants: readable and writable by the `anon` role,
-- which is what the publishable key in every browser bundle maps to. Run this
-- file again (Supabase SQL editor, or the Supabase MCP `apply_migration`)
-- whenever you reset the schema, or after adding a table by hand.
--
-- Order: run AFTER `prisma db push` and after `supabase/triggers.sql`.
--
-- Idempotent throughout. Re-running changes nothing.
--
-- The reasoning, and the evidence behind each decision, is in the two
-- migrations this consolidates:
--   docs/migrations/2026-08-30-revoke-anon-table-grants.sql
--   docs/migrations/2026-08-30-enable-rls-public.sql

BEGIN;

-- 1. What a future table inherits. ------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- 2. No table but healthcheck is reachable by the browser's key. -------------
-- healthcheck is a single-row liveness probe with a deliberate anon-read
-- policy and no business data.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'healthcheck'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- 3. RLS on everything. ------------------------------------------------------
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

-- 4. The fourteen catalog tables the VKT storefront reads. -------------------
-- vktbougie_reader has no rolbypassrls. A table missing from this list is not
-- an error at runtime; it is a blank page. Add to it whenever the storefront
-- starts reading something new.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products', 'product_images', 'product_variants', 'product_tags',
    'categories', 'inventory_items', 'inventory_movements', 'reviews',
    'sale_events', 'sale_event_products', 'commerce_settings',
    'delivery_zones', 'delivery_notes', 'store_pickup_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "storefront_reader_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "storefront_reader_select" ON public.%I FOR SELECT TO vktbougie_reader USING (true)', t);
  END LOOP;
END $$;

-- 4b. The three that hold people and tenants, scoped by row as well. ---------
-- These carry every user's email and every space's roster, so USING (true)
-- would let one storefront's credential read the whole platform. Scoped by
-- storefrontEnabled rather than a hardcoded space id, so a new or renamed
-- space cannot silently empty the storefront.
DROP POLICY IF EXISTS "storefront_reader_select" ON public."spaces";
CREATE POLICY "storefront_reader_select"
    ON public."spaces" FOR SELECT TO vktbougie_reader
    USING ("storefrontEnabled");

DROP POLICY IF EXISTS "storefront_reader_select" ON public."space_members";
CREATE POLICY "storefront_reader_select"
    ON public."space_members" FOR SELECT TO vktbougie_reader
    USING (EXISTS (
        SELECT 1 FROM public."spaces" s
         WHERE s."id" = "space_members"."spaceId" AND s."storefrontEnabled"
    ));

-- Super admins stay visible platform-wide on purpose: email.ts reads them as
-- the platform-level recipient of merchant alerts.
DROP POLICY IF EXISTS "storefront_reader_select" ON public."profiles";
CREATE POLICY "storefront_reader_select"
    ON public."profiles" FOR SELECT TO vktbougie_reader
    USING (
        "isSuperAdmin"
        OR EXISTS (
            SELECT 1 FROM public."spaces" s
             WHERE s."ownerId" = "profiles"."id" AND s."storefrontEnabled"
        )
        OR EXISTS (
            SELECT 1 FROM public."space_members" m
              JOIN public."spaces" s ON s."id" = m."spaceId"
             WHERE m."userId" = "profiles"."id" AND s."storefrontEnabled"
        )
    );

-- 5. Columns, for the three tables holding more than the catalog. ------------
-- RLS filters rows, never columns, and spaces holds storefrontKey. The lists
-- are exactly what the storefront selects; see the migration for the per-query
-- derivation.
REVOKE SELECT ON public."spaces" FROM vktbougie_reader;
-- storefrontEnabled is included because the two policies above reach into
-- spaces as a subquery, which runs as the caller and so needs the column.
GRANT SELECT ("id", "name", "ownerId", "storefrontEnabled") ON public."spaces" TO vktbougie_reader;

REVOKE SELECT ON public."profiles" FROM vktbougie_reader;
GRANT SELECT ("id", "email", "isSuperAdmin") ON public."profiles" TO vktbougie_reader;

REVOKE SELECT ON public."space_members" FROM vktbougie_reader;
GRANT SELECT ("id", "spaceId", "userId", "status", "role") ON public."space_members" TO vktbougie_reader;

-- 6. healthcheck stays publicly readable. ------------------------------------
DROP POLICY IF EXISTS "healthcheck is publicly readable" ON public."healthcheck";
CREATE POLICY "healthcheck is publicly readable"
    ON public."healthcheck" FOR SELECT TO anon, authenticated USING (true);

-- Fail rather than leave the schema half done. This file is re-applied by hand
-- after a destructive push, which is exactly where a partial success would
-- otherwise pass unnoticed until a shopper hit it.
DO $$
DECLARE
  reachable int;
  unprotected int;
  covered int;
BEGIN
  SELECT count(*) INTO reachable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'healthcheck'
     AND (has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('anon', c.oid, 'INSERT')
       OR has_table_privilege('anon', c.oid, 'UPDATE')
       OR has_table_privilege('anon', c.oid, 'DELETE')
       OR has_table_privilege('authenticated', c.oid, 'SELECT')
       OR has_table_privilege('authenticated', c.oid, 'INSERT')
       OR has_table_privilege('authenticated', c.oid, 'UPDATE')
       OR has_table_privilege('authenticated', c.oid, 'DELETE'));
  IF reachable <> 0 THEN
    RAISE EXCEPTION 'expected no table but healthcheck to be reachable by anon or authenticated, found %', reachable;
  END IF;

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

  -- The space_members and profiles policies reach into spaces as a subquery,
  -- which runs as the caller. Without this column the reader cannot evaluate
  -- them at all and every read of either table fails with permission denied.
  -- Asserted here and not only in the one-shot migration, because this is the
  -- file that gets re-applied after a destructive push.
  IF NOT has_column_privilege('vktbougie_reader', 'public.spaces', 'storefrontEnabled', 'SELECT') THEN
    RAISE EXCEPTION 'the reader cannot read spaces.storefrontEnabled, so its policies cannot run';
  END IF;
END $$;

COMMIT;

-- Read back as vktbougie_reader, not as postgres: postgres holds rolbypassrls
-- and would report success whatever the policies say.
--   SELECT count(*) FROM "products";   -> the catalog, not 0
--   SELECT count(*) FROM "orders";     -> 0, and no error
--   SELECT "storefrontKey" FROM "spaces";  -> permission denied, loudly
