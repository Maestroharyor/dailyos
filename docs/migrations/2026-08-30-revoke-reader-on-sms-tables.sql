-- Take the storefront reader's SELECT off the two SMS tables.
--
-- Not currently exploitable: both tables have RLS on and zero policies, so a
-- role without rolbypassrls sees no rows regardless of the grant. This is
-- defence in depth, and it closes a latent hole rather than an open one.
--
-- Where the grant came from: there is a standing
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--       GRANT SELECT ON TABLES TO vktbougie_reader;
-- so *every* new public table hands the storefront reader a SELECT grant on
-- creation. That is how space_sms_settings, which holds encrypted Termii API
-- keys and webhook secrets, acquired one the moment it was created. The only
-- thing standing between that grant and the credentials is one permissive
-- policy or one ALTER TABLE ... DISABLE ROW LEVEL SECURITY.
--
-- The systemic fix is to drop that default privilege and grant the storefront
-- its 14 catalog tables explicitly, the way supabase/security.sql already does
-- for spaces, profiles and space_members. That is a larger change and is NOT
-- done here, because those 14 tables currently depend on the default grant and
-- revoking it wholesale would empty the shop. Tracked as a follow-up.
--
-- Idempotent. Re-running changes nothing.

BEGIN;

REVOKE ALL ON public.space_sms_settings FROM vktbougie_reader;
REVOKE ALL ON public.notification_logs  FROM vktbougie_reader;

DO $$
BEGIN
  IF has_table_privilege('vktbougie_reader', 'public.space_sms_settings', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader still holds SELECT on space_sms_settings';
  END IF;
  IF has_table_privilege('vktbougie_reader', 'public.notification_logs', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader still holds SELECT on notification_logs';
  END IF;
  -- The catalog must still be readable, or this "fix" is an outage.
  IF NOT has_table_privilege('vktbougie_reader', 'public.products', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader lost products';
  END IF;
  IF NOT has_table_privilege('vktbougie_reader', 'public.product_variants', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader lost product_variants';
  END IF;
END $$;

COMMIT;
