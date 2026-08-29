-- Backfill app_metadata.emailVerified.
--
-- RUN THIS BEFORE the merchant gate reaches production, not before the later
-- "Confirm email" switch. The original header said the latter and it was wrong,
-- which is how PR #71 shipped a gate that locked out every existing merchant:
-- lib/supabase/middleware.ts reads app_metadata.emailVerified and treats an
-- absent flag as unverified. That is the right default for a new account and
-- the wrong one for everyone who signed up before the flag existed, so without
-- this every merchant is redirected to /verify-email on their next request.
--
-- A gate's grandfather clause belongs to the merge that adds the gate.
--
-- Run in the Supabase SQL editor, or against DIRECT_URL (:5432).


-- 1. Look before you write. --------------------------------------------------
--
-- `confirm_gap` answers a question the dashboard also answers, and answers it
-- from the data: whether the project's "Confirm email" setting is still on.
-- With it on, confirmation is a human going to their inbox, so the gap is
-- minutes or hours. With it off, GoTrue's autoconfirm path stamps
-- email_confirmed_at in the same transaction that creates the row, so the gap
-- is milliseconds. OAuth accounts also show ~0, for the same structural reason.

SELECT id,
       email,
       created_at,
       email_confirmed_at,
       email_confirmed_at - created_at        AS confirm_gap,
       raw_app_meta_data ->> 'provider'       AS provider,
       raw_app_meta_data ->> 'emailVerified'  AS flag
FROM   auth.users
ORDER  BY created_at DESC;


-- 2. Grandfather the accounts that genuinely confirmed. ----------------------
--
-- The interval is what makes this correct whether or not the switch has already
-- been flipped. Keying off `email_confirmed_at IS NOT NULL` alone is right only
-- while confirmation is still required; after the flip that column does not go
-- quiet, it goes uniformly true, and the same statement would bless accounts
-- that never proved anything. Requiring confirmation to have happened
-- measurably AFTER signup grants the flag only where a human actually went and
-- got it.
--
-- OAuth accounts are deliberately outside this filter: they confirm at creation,
-- so their gap is ~0 and nothing in SQL distinguishes them from an autoconfirmed
-- password account. They are handled in code instead - isEmailVerified reads the
-- provider's own assertion off the identity - which is both more precise and not
-- dependent on anyone remembering to run this file.
--
-- Idempotent: the last condition skips rows that already carry the flag, and
-- `||` merges into whatever raw_app_meta_data already holds (provider,
-- providers) rather than replacing it.

UPDATE auth.users
SET    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || '{"emailVerified": true}'::jsonb
WHERE  email_confirmed_at IS NOT NULL
  AND  email_confirmed_at > created_at + interval '2 seconds'
  AND  coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true';


-- 3. Check. -----------------------------------------------------------------
--
-- Expect unverified_users to be the OAuth accounts (covered in code) plus any
-- account that genuinely never confirmed. The latter are asked to verify on
-- their next sign-in, which is the intended behaviour rather than a regression.

SELECT count(*) FILTER (WHERE raw_app_meta_data ->> 'emailVerified' = 'true')
         AS flagged_users,
       count(*) FILTER (WHERE coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true')
         AS unflagged_users,
       count(*) FILTER (WHERE coalesce(raw_app_meta_data ->> 'provider', 'email') <> 'email')
         AS oauth_users,
       count(*) AS total_users
FROM   auth.users;
