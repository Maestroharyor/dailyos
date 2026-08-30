-- Per-shop numbering plan for reading national-format phone numbers
-- (feat/sms-phone-normalization, phase 1 of the SMS channel).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL.
--
-- Why a column and not a constant: national format is ambiguous across
-- countries. A GB mobile and an NG mobile are both a trunk zero and ten digits,
-- so "07911123456" is a valid reading in either. Normalizing every shop's
-- numbers against a global "NG" does not merely fail to parse a British
-- number, it silently rewrites it into a fabricated Nigerian one and sends a
-- paid message to whoever owns that number. The shop has to say which plan its
-- customers type in; a customer abroad types a country code, which wins.
--
-- Safe on a live database: additive, and the default preserves today's
-- behaviour for the existing Nigerian spaces.

ALTER TABLE "commerce_settings"
  ADD COLUMN IF NOT EXISTS "defaultPhoneRegion" TEXT NOT NULL DEFAULT 'NG';

-- Existing rows take the default, which is correct for every space today.
-- Set another explicitly if a shop serves a different market, using a code
-- present in REGIONS in src/lib/commerce/phone.ts:
--
--   UPDATE "commerce_settings" SET "defaultPhoneRegion" = 'GB' WHERE "spaceId" = '...';
