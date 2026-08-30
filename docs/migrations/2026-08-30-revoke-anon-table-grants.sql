-- Stop the browser's publishable key reading and writing the public schema.

-- Supabase exposes `public` through PostgREST to the `anon` role, and `anon` is
-- what the publishable key in every browser bundle maps to. Every table in the
-- schema currently grants that role arwdDxtm: SELECT, INSERT, UPDATE, DELETE
-- and TRUNCATE. 48 of the 53 also have RLS off with no policies, so the grant
-- is the only thing standing between a page visitor and the data. Confirmed
-- against the live API with VKT's own publishable key: customers, orders,
-- profiles and spaces all answered HTTP 206 with rows. `spaces` holds
-- storefrontKey, the credential VKT authenticates to the storefront API with.
--
-- Nothing legitimate uses this path. DailyOS reaches Postgres through Prisma as
-- `postgres`; VKT reads directly as `vktbougie_reader`. Searched both repos for
-- .from( / .rpc( / .channel( on a Supabase client: the only hits are
-- storage.from(...) in api/uploads on the service-role client, and Storage is a
-- different API that table grants do not govern. Every publishable-key call
-- site in both repos is supabase.auth.*, which talks to GoTrue and is unaffected.
--
-- Revoking the existing grants is not enough on its own. ALTER DEFAULT
-- PRIVILEGES for role postgres in this schema grants the same arwdDxtm on
-- tables created in future, and this project applies DDL by hand as postgres,
-- so the next CREATE TABLE would reopen it. Section 1 is what makes the fix
-- durable; section 2 is what fixes today.
--
-- Only the postgres grantor is altered. A default ACL governs objects created
-- by that role, and altering supabase_admin's would need membership in it and
-- would cover objects we never create.
--
-- service_role keeps everything. It is server-only, holds rolbypassrls, and is
-- what DailyOS's admin client uses for Storage and the Auth Admin API.
--
-- Safe on a live database: no data is read or written, and no application role
-- loses anything it uses. Run against DIRECT_URL (:5432), never the pooled
-- DATABASE_URL (:6543).

BEGIN;

-- 1. What future tables inherit. -------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated;

-- Precautionary, with no effect today: the schema's only function is
-- handle_new_user, which returns trigger and so cannot be called over RPC. It
-- closes the usual escalation route, at the cost that a future deliberate RPC
-- will need an explicit GRANT EXECUTE.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- The vktbougie_reader default SELECT is deliberately left in place. The
-- companion migration makes RLS that role's boundary, not grants.

-- 2. Every existing table except healthcheck. -------------------------------
-- A loop over pg_class rather than 52 literal statements, so a table added
-- between writing this and applying it cannot be missed.
--
-- healthcheck is a single-row liveness probe (id smallint CHECK (id = 1)) with
-- a deliberate anon-read policy and no business data. Neither repo references
-- it, so something external polls it, and it keeps its grant.
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

-- Fail the whole transaction rather than leave the schema half open.
DO $$
DECLARE
  reachable int;
BEGIN
  SELECT count(*) INTO reachable
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relname <> 'healthcheck'
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
END $$;

COMMIT;

-- Read back. The role matters: run the first two as anon over PostgREST, not as
-- postgres in psql, because postgres bypasses both grants and RLS and would
-- report success either way.
--   GET /rest/v1/customers  with the publishable key                -> 401/403, not 200
--   GET /rest/v1/healthcheck with the publishable key               -> 200, one row
--   SELECT count(*) FROM pg_class c JOIN pg_namespace n
--     ON n.oid = c.relnamespace WHERE n.nspname = 'public'
--    AND c.relkind = 'r' AND has_table_privilege('anon', c.oid, 'SELECT');  -> 1 (healthcheck)
--   SELECT defaclacl FROM pg_default_acl d JOIN pg_namespace n
--     ON n.oid = d.defaclnamespace WHERE n.nspname = 'public'
--    AND defaclobjtype = 'r' AND pg_get_userbyid(defaclrole) = 'postgres';
--                                        -> no anon= or authenticated= entry
