-- Turn customer SMS off by default.
--
-- notifyCustomer defaulted to true, mirroring the email settings it was cloned
-- from. That mirror is wrong for SMS: relaying an email costs nothing, so
-- sending a half-configured merchant's mail under the DailyOS sender is a
-- kindness. A text message is billed per send against a prepaid wallet, so the
-- same default quietly signs a merchant up to spend money they never agreed to
-- spend, on an account that until now was DailyOS's.
--
-- Sending is now gated on the space having its own verified Termii account, so
-- this default only decides what happens after a merchant has connected one.
--
-- Existing rows are updated too, not only the default. There are none today,
-- and a merchant who has explicitly turned SMS on has done so on a build where
-- the platform paid; leaving those true would keep exactly the behaviour this
-- change exists to stop. Anyone who wants it back can flip it in settings.
--
-- Idempotent. Re-running changes nothing.

BEGIN;

ALTER TABLE "space_sms_settings" ALTER COLUMN "notifyCustomer" SET DEFAULT false;

UPDATE "space_sms_settings" SET "notifyCustomer" = false WHERE "notifyCustomer" = true;

DO $$
DECLARE
  still_on int;
BEGIN
  SELECT count(*) INTO still_on FROM "space_sms_settings" WHERE "notifyCustomer";
  IF still_on <> 0 THEN
    RAISE EXCEPTION 'expected no space to have customer SMS on, found %', still_on;
  END IF;
END $$;

COMMIT;
