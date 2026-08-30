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

-- 4. The seventeen tables the VKT storefront reads. --------------------------
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
    'delivery_zones', 'delivery_notes', 'store_pickup_settings',
    'spaces', 'space_members', 'profiles'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "storefront_reader_select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "storefront_reader_select" ON public.%I FOR SELECT TO vktbougie_reader USING (true)', t);
  END LOOP;
END $$;

-- 5. healthcheck stays publicly readable. ------------------------------------
DROP POLICY IF EXISTS "healthcheck is publicly readable" ON public."healthcheck";
CREATE POLICY "healthcheck is publicly readable"
    ON public."healthcheck" FOR SELECT TO anon, authenticated USING (true);

COMMIT;

-- Read back as vktbougie_reader, not as postgres: postgres holds rolbypassrls
-- and would report success whatever the policies say.
--   SELECT count(*) FROM "products";   -> the catalog, not 0
--   SELECT count(*) FROM "orders";     -> 0, and no error
