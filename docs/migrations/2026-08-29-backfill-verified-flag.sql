-- Backfill app_metadata.emailVerified (feat/merchant-verification-gate).
--
-- RUN THIS IMMEDIATELY BEFORE turning the project's "Confirm email" setting
-- off, together with the re-run of the Customer.emailVerifiedAt backfill in
-- 2026-08-29-customer-email-verified.sql. Not earlier: both are correct at the
-- moment they run and go stale afterwards.
--
-- Run against DIRECT_URL (:5432).
--
-- Why this is needed at all: the merchant gate in lib/supabase/middleware.ts
-- reads app_metadata.emailVerified and treats an absent flag as unverified,
-- which is the right default for a new account and the wrong one for the
-- merchants who signed up before the flag existed. Without this every existing
-- merchant is redirected to /verify-email on their next request.
--
-- It cannot key off email_confirmed_at after the switch, because autoconfirm
-- stamps that column for everybody. That is exactly why it has to run first.
--
-- Idempotent: the WHERE clause skips rows that already carry the flag, and
-- `||` merges into whatever raw_app_meta_data already holds (provider,
-- providers) rather than replacing it.

UPDATE auth.users
SET    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || '{"emailVerified": true}'::jsonb
WHERE  email_confirmed_at IS NOT NULL
  AND  coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true';


-- Check. Expect unverified_users to be only the accounts that genuinely never
-- confirmed; those will be asked to verify on their next sign-in, which is the
-- intended behaviour rather than a regression.

SELECT count(*) FILTER (WHERE raw_app_meta_data ->> 'emailVerified' = 'true') AS verified_users,
       count(*) FILTER (WHERE coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true')
         AS unverified_users,
       count(*) AS total_users
FROM   auth.users;
