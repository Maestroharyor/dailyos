-- Stop the storefront reader seeing people and spaces it has no business with.

-- 2026-08-30-enable-rls-public.sql gave vktbougie_reader USING (true) on all
-- seventeen tables it reads, then narrowed spaces, profiles and space_members
-- by column so the reader could not see storefrontKey. Columns were only half
-- of it: the role could still read every row, which on these three means every
-- user's email address and every space's membership roster, platform-wide,
-- from a credential that lives in another application's environment.
--
-- The other fourteen tables stay USING (true). They are catalog: products,
-- categories, images, delivery zones and so on. Narrowing those is a bigger
-- change and is deliberately not attempted here.
--
-- Scoped by storefrontEnabled rather than by a hardcoded space id. Hardcoding
-- would be tighter today and wrong tomorrow: a new VKT space, or a space id
-- that moves, silently empties the storefront rather than erroring, which is
-- this role's whole failure mode. storefrontEnabled is the flag that already
-- decides whether a space has a storefront at all, so the policy tracks the
-- thing it is actually about.
--
-- profiles keeps super admins visible platform-wide. That is not an oversight:
-- email.ts:44 reads every super admin on purpose, as the platform-level
-- recipient of merchant alerts, and scoping them by space would break the
-- alerting rather than tighten it.
--
-- Verified before writing: this hides 5 of 7 profiles and 1 of 3 spaces, and
-- every recipient the alert path resolves - 1 super admin, 1 space owner,
-- 2 owner/admin members - stays visible.
--
-- No recursion. The profiles policy reads space_members, whose policy reads
-- spaces, whose policy reads only its own column.
--
-- Idempotent. Safe on a live database: policies only ever narrow what a single
-- read-only role can see, and no other role has a policy on these tables.

BEGIN;

-- 0. The column the policies below test. -------------------------------------
-- A policy on a table is evaluated by the system, but a policy that reaches
-- into another table is a subquery run as the caller, so the caller needs
-- SELECT on the columns it touches. Without this the two EXISTS clauses below
-- fail with "permission denied for table spaces" the moment anything reads
-- space_members or profiles. storefrontEnabled is a boolean saying whether a
-- shop is switched on; it is not the storefrontKey and carries nothing.
GRANT SELECT ("storefrontEnabled") ON public."spaces" TO vktbougie_reader;

-- 1. spaces: the ones that actually have a storefront. -----------------------
DROP POLICY IF EXISTS "storefront_reader_select" ON public."spaces";
CREATE POLICY "storefront_reader_select"
    ON public."spaces" FOR SELECT TO vktbougie_reader
    USING ("storefrontEnabled");

-- 2. space_members: rosters of those spaces only. ----------------------------
DROP POLICY IF EXISTS "storefront_reader_select" ON public."space_members";
CREATE POLICY "storefront_reader_select"
    ON public."space_members" FOR SELECT TO vktbougie_reader
    USING (EXISTS (
        SELECT 1 FROM public."spaces" s
         WHERE s."id" = "space_members"."spaceId" AND s."storefrontEnabled"
    ));

-- 3. profiles: super admins, plus anyone attached to a storefront space. -----
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

-- Fail rather than leave the storefront unable to name its own brand or the
-- alert path unable to find a recipient.
DO $$
DECLARE
  policies int;
  hidden int;
  unreachable int;
BEGIN
  SELECT count(*) INTO policies FROM pg_policies
   WHERE schemaname = 'public' AND policyname = 'storefront_reader_select'
     AND 'vktbougie_reader' = ANY (roles::text[]);
  IF policies <> 17 THEN
    RAISE EXCEPTION 'expected 17 storefront reader policies, found %', policies;
  END IF;

  -- The narrowing has to actually bite, or the migration did nothing.
  SELECT count(*) INTO hidden FROM public."profiles" p
   WHERE NOT (p."isSuperAdmin"
     OR EXISTS (SELECT 1 FROM public."spaces" s WHERE s."ownerId" = p."id" AND s."storefrontEnabled")
     OR EXISTS (SELECT 1 FROM public."space_members" m JOIN public."spaces" s ON s."id" = m."spaceId"
                 WHERE m."userId" = p."id" AND s."storefrontEnabled"));
  IF hidden = 0 THEN
    RAISE EXCEPTION 'the profiles policy hides nobody, so it is not doing anything';
  END IF;

  -- Every alert recipient must survive it.
  SELECT count(*) INTO unreachable FROM (
    SELECT p."id" FROM public."profiles" p WHERE p."isSuperAdmin"
    UNION
    SELECT p."id" FROM public."profiles" p JOIN public."spaces" s ON s."ownerId" = p."id"
     WHERE s."storefrontEnabled"
    UNION
    SELECT p."id" FROM public."profiles" p
      JOIN public."space_members" m ON m."userId" = p."id"
      JOIN public."spaces" s ON s."id" = m."spaceId"
     WHERE s."storefrontEnabled" AND m."status" = 'active' AND m."role" IN ('owner', 'admin')
  ) needed
   WHERE NOT ("id" IN (
     SELECT p."id" FROM public."profiles" p
      WHERE p."isSuperAdmin"
        OR EXISTS (SELECT 1 FROM public."spaces" s WHERE s."ownerId" = p."id" AND s."storefrontEnabled")
        OR EXISTS (SELECT 1 FROM public."space_members" m JOIN public."spaces" s ON s."id" = m."spaceId"
                    WHERE m."userId" = p."id" AND s."storefrontEnabled")));
  IF unreachable <> 0 THEN
    RAISE EXCEPTION 'the policy would hide % merchant alert recipient(s)', unreachable;
  END IF;

  -- Without this grant the two EXISTS clauses cannot be evaluated at all.
  IF NOT has_column_privilege('vktbougie_reader', 'public.spaces', 'storefrontEnabled', 'SELECT') THEN
    RAISE EXCEPTION 'the reader cannot read spaces.storefrontEnabled, so the policies cannot run';
  END IF;
  IF has_column_privilege('vktbougie_reader', 'public.spaces', 'storefrontKey', 'SELECT') THEN
    RAISE EXCEPTION 'the storefront reader can still read spaces.storefrontKey';
  END IF;
END $$;

COMMIT;

-- Read back, as vktbougie_reader rather than as postgres, because postgres
-- bypasses RLS and would report success either way.
--   SELECT count(*) FROM "spaces";         -> 2, not 3
--   SELECT count(*) FROM "profiles";       -> 2, not 7
--   SELECT count(*) FROM "space_members";  -> 3, not 4
--   SELECT "name" FROM "spaces";           -> VKT and VKT Test, brand lookup intact
