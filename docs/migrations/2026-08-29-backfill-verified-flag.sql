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
-- TWO VARIANTS. Query 1 tells you which one you want, and picking the wrong one
-- is not harmless in either direction. Read the confirm_gap column first.
--
-- (a) "Confirm email" is still ON - every password account shows a human-sized
--     gap. Then email_confirmed_at means what it says for EVERY account, OAuth
--     included, and this is the one to run:

UPDATE auth.users
SET    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || '{"emailVerified": true}'::jsonb
WHERE  email_confirmed_at IS NOT NULL
  AND  coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true';


-- (b) "Confirm email" is already OFF - password accounts show sub-second gaps,
--     because autoconfirm stamps both columns in the same transaction. Then the
--     statement above would bless accounts that never proved anything, and this
--     one bounds the grant to confirmations that demonstrably happened after
--     signup:
--
--     UPDATE auth.users
--     SET    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                                || '{"emailVerified": true}'::jsonb
--     WHERE  email_confirmed_at IS NOT NULL
--       AND  email_confirmed_at > created_at + interval '2 seconds'
--       AND  coalesce(raw_app_meta_data ->> 'emailVerified', 'false') <> 'true';
--
-- Note what (b) costs, because it is easy to miss: OAuth accounts confirm at
-- creation, so their gap is ~0 and the interval excludes them too. That is
-- correct only because isEmailVerified reads the provider's own assertion off
-- the identity - so under (b) an OAuth merchant is unblocked by DEPLOYING the
-- code, not by running this file. Under (a) they are covered here as well.
--
-- This is not hypothetical. On the incident this file was written for, every
-- account that mattered was Google, the setting was still ON, and running (b)
-- would have left the person who ran it locked out with a query that reported
-- success.
--
-- Both variants are idempotent: the last condition skips rows that already
-- carry the flag, and `||` merges into whatever raw_app_meta_data already holds
-- (provider, providers) rather than replacing it.


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
