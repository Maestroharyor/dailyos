-- VKT delivery options: state-driven rates, store pickup, and the refundable
-- hold that is not a shipping fee (feat/delivery-options).
--
-- Run against DIRECT_URL (:5432), never the pooled DATABASE_URL (:6543):
-- pgbouncer cannot carry DDL. Prefer this over `bun run db:push`, which is
-- blocked in this project by the cross-schema FK (public.profiles ->
-- auth.users) and errors with P4002.
--
-- Safe to re-run. Every DDL statement is guarded, and the seed upserts on a
-- deterministic id, so running it twice re-applies the rate sheet rather than
-- duplicating it.
--
-- ORDER MATTERS in one place only: step 4 backfills the delivery snapshot onto
-- existing orders and step 6 deletes the rows it read from. Do not reorder them.
--
-- WHAT THIS CHANGES FOR CUSTOMERS
--   * Checkout stops guessing a fee from the typed city and asks for a state
--     and an option instead.
--   * commerce_settings.freeShippingThreshold is deliberately NOT touched. It
--     stays at 70000 on both VKT spaces and the shop banner stays up. What
--     changes is that it now only waives options flagged for it, seeded as
--     fee <= 4000, so a 70,000 cart no longer waives a 10,000 doorstep fee.


BEGIN;

-- 1. Types. ----------------------------------------------------------------
--
-- CREATE TYPE rather than ALTER TYPE ADD VALUE, so unlike the delivery
-- lifecycle migration these are usable in the same transaction that made them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryType') THEN
    CREATE TYPE "DeliveryType" AS ENUM (
      'door_to_door', 'interstate_hub', 'interstate_doorstep', 'store_pickup'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DepositStatus') THEN
    CREATE TYPE "DepositStatus" AS ENUM ('none', 'held', 'returned', 'forfeited');
  END IF;
END
$$;


-- 2. Delivery options. -----------------------------------------------------
--
-- `state` lands NOT NULL DEFAULT '' so it can be added to a live table. The
-- default is dropped in step 7, once the only rows that could have taken it are
-- gone, and a CHECK stops anything landing in the empty bucket afterwards. A
-- permanent default of '' would let rows created through any older path collide
-- on name under the new unique key, which is the collision that key exists to
-- prevent.

ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "deliveryType" "DeliveryType" NOT NULL DEFAULT 'door_to_door';
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "pickupAddress" TEXT;
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "noteKey" TEXT;
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
-- Per option rather than global. One flat threshold across a 3,000-10,000
-- spread absorbs three times as much on a distant order as on a local one for
-- identical revenue, and the distant rows are the ones least likely to see that
-- order value again.
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "qualifiesForFreeShipping" BOOLEAN NOT NULL DEFAULT true;


-- 3. Order snapshot, deposit and pickup lifecycle. --------------------------
--
-- deliveryZoneId is a live FK that goes null when an option is retired. These
-- five hold what the customer actually saw and agreed to, so repricing or
-- deleting an option never rewrites the history of an order already placed.
-- deliveryNote is stored in full because it is the terms accepted at payment.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryType"          "DeliveryType";
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryState"         TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryLabel"         TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryNote"          TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryPickupAddress" TEXT;

-- A refundable hold, kept apart from shippingFee on purpose. It pays no
-- courier and is not revenue: it comes back on collection or is retained if
-- nobody comes. Sharing a column with shipping is what would let the free
-- shipping threshold waive it and would overstate income on every out-of-state
-- pickup order.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "depositFee"       DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "depositStatus"    "DepositStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "depositSettledAt" TIMESTAMP(3);

-- The collection deadline runs from the notification, not the order date, which
-- is why the notification timestamp has to be stored: without it there is no
-- defensible basis for releasing somebody's paid-for item. pickupOverdueAt is
-- set by a non-destructive on-read sweep; releasing is always a person's click.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupNotifiedAt"  TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupDeadlineAt"  TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupOverdueAt"   TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupCollectedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickupReleasedAt"  TIMESTAMP(3);


-- 4. New tables. -----------------------------------------------------------
--
-- Notes are keyed rather than inlined on each option: the interstate hub note
-- is four sentences under 74 options, and holding it per row would mean 74
-- edits to change a word and 74 chances for one to end up saying something
-- different. These are terms a customer accepts, so they must be identical.

CREATE TABLE IF NOT EXISTS "delivery_notes" (
  "id"            TEXT NOT NULL,
  "spaceId"       TEXT NOT NULL,
  "key"           TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "isCollapsible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_notes_spaceId_key_key"
  ON "delivery_notes" ("spaceId", "key");

-- Store pickup is not a delivery zone: it is offered everywhere, needs no
-- delivery address, and outside the home state takes a refundable hold rather
-- than a fee. One row per space, two price tiers.
CREATE TABLE IF NOT EXISTS "store_pickup_settings" (
  "id"                TEXT NOT NULL,
  "spaceId"           TEXT NOT NULL,
  "isEnabled"         BOOLEAN NOT NULL DEFAULT false,
  "label"             TEXT NOT NULL DEFAULT 'Store pickup',
  "address"           TEXT,
  "homeState"         TEXT NOT NULL,
  "homeFee"           DECIMAL(10,2) NOT NULL DEFAULT 0,
  "homeWindowLabel"   TEXT NOT NULL,
  "homeHoldDays"      INTEGER NOT NULL,
  "homeNoteKey"       TEXT NOT NULL,
  "awayFee"           DECIMAL(10,2) NOT NULL DEFAULT 0,
  "awayFeeRefundable" BOOLEAN NOT NULL DEFAULT true,
  "awayWindowLabel"   TEXT NOT NULL,
  "awayHoldDays"      INTEGER NOT NULL,
  "awayNoteKey"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "store_pickup_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_pickup_settings_spaceId_key"
  ON "store_pickup_settings" ("spaceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_spaceId_fkey') THEN
    ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_pickup_settings_spaceId_fkey') THEN
    ALTER TABLE "store_pickup_settings" ADD CONSTRAINT "store_pickup_settings_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;


-- 5. Backfill the snapshot, BEFORE the old rows are deleted. ----------------
--
-- Three live orders reference the 20 legacy Lagos LGA zones. The FK is
-- ON DELETE SET NULL, so deleting those rows would not fail, it would silently
-- strip the only record of which area each order was sent to. shippingFee is
-- already on the order; the label is what would be lost.

UPDATE "orders" o
SET "deliveryLabel" = z."name",
    "deliveryState" = 'Lagos',
    "deliveryType"  = 'door_to_door'
FROM "delivery_zones" z
WHERE o."deliveryZoneId" = z."id"
  AND o."deliveryLabel" IS NULL;


-- 6. Retire the legacy rate sheet. -----------------------------------------
--
-- The 20 zones named after Lagos LGAs encode the model this change removes:
-- one flat name matched against a typed city. Their names collide with nothing
-- in the new sheet, so they would otherwise sit alongside it at checkout.
-- Identified by the empty state they were backfilled with, so this cannot
-- touch a row inserted by step 8.

DELETE FROM "delivery_zones" WHERE "state" = '';


-- 7. Close the empty-state hole. -------------------------------------------

ALTER TABLE "delivery_zones" ALTER COLUMN "state" DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_zones_state_not_blank') THEN
    ALTER TABLE "delivery_zones"
      ADD CONSTRAINT "delivery_zones_state_not_blank" CHECK ("state" <> '');
  END IF;
END
$$;

-- Scoped by state: "Doorstep delivery" and "Agbara hub pickup" are distinct
-- options that have to be able to repeat across states.
ALTER TABLE "delivery_zones" DROP CONSTRAINT IF EXISTS "delivery_zones_spaceId_name_key";
DROP INDEX IF EXISTS "delivery_zones_spaceId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zones_spaceId_state_name_key"
  ON "delivery_zones" ("spaceId", "state", "name");
CREATE INDEX IF NOT EXISTS "delivery_zones_spaceId_state_isActive_idx"
  ON "delivery_zones" ("spaceId", "state", "isActive");


-- 8. The rate sheet. -------------------------------------------------------
--
-- 18 Lagos door-to-door, 74 interstate hub and 4 interstate doorstep options
-- across 36 states plus the FCT, for both VKT spaces. Amounts in the source
-- sheet are kobo; delivery_zones.fee is naira, so each is divided by 100.
--
-- Ids are deterministic (md5 of space, state and name) so re-running this
-- re-prices the existing rows rather than inserting a second copy of the sheet.
--
-- qualifiesForFreeShipping is seeded as fee <= 4000, which qualifies 19 rows
-- and excludes 77 including every doorstep option. That caps what a 70,000
-- cart can absorb at 4,000 rather than 9,000. It is a starting position, not a
-- derived answer: change it per row in commerce settings.


INSERT INTO "delivery_notes" ("id", "spaceId", "key", "label", "body", "isCollapsible")
VALUES
  ('dn_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'DOOR_TO_DOOR'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'DOOR_TO_DOOR', 'Delivery takes 2 - 4 working days', 'Delivery takes 2 - 4 working days. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', false),
  ('dn_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'INTERSTATE_HUB'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'INTERSTATE_HUB', 'Delivery takes 2 - 10 working days, collect from the park', 'Delivery takes 2 - 10 working days. The courier will message you when your order arrives and you can collect it the same day. Late collection may attract additional charges from the courier. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', true),
  ('dn_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'INTERSTATE_DOORSTEP'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'INTERSTATE_DOORSTEP', 'Delivery takes 2 - 10 working days', 'Delivery takes 2 - 10 working days. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', false),
  ('dn_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'STORE_PICKUP_HOME'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'STORE_PICKUP_HOME', 'Collect from the store within 5-7 working days', 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up your order within 5–7 working days after we’ve notified you.
However, if your order is not picked up within 7 working days after notification, we reserve the right to release your item(s) for sale to another customer. You will be refunded for the order, but the item(s) may no longer be available to you.', true),
  ('dn_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'STORE_PICKUP_AWAY'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'STORE_PICKUP_AWAY', 'Collect from the store within 14 - 16 working days', 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up your order within 14 - 16 working days after we’ve notified you. Your ₦1,000 store pickup fee is refunded when you collect.
However, if your order is not picked up within 14 - 16 working days after notification, we reserve the right to release your item(s) for sale to another customer. You will be refunded for the order, but the ₦1,000 store pickup fee is retained and the item(s) may no longer be available to you.', true),
  ('dn_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'DOOR_TO_DOOR'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'DOOR_TO_DOOR', 'Delivery takes 2 - 4 working days', 'Delivery takes 2 - 4 working days. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', false),
  ('dn_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'INTERSTATE_HUB'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'INTERSTATE_HUB', 'Delivery takes 2 - 10 working days, collect from the park', 'Delivery takes 2 - 10 working days. The courier will message you when your order arrives and you can collect it the same day. Late collection may attract additional charges from the courier. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', true),
  ('dn_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'INTERSTATE_DOORSTEP'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'INTERSTATE_DOORSTEP', 'Delivery takes 2 - 10 working days', 'Delivery takes 2 - 10 working days. You might be asked to balance up on your delivery fee if it weighs higher than 4kg', false),
  ('dn_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'STORE_PICKUP_HOME'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'STORE_PICKUP_HOME', 'Collect from the store within 5-7 working days', 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up your order within 5–7 working days after we’ve notified you.
However, if your order is not picked up within 7 working days after notification, we reserve the right to release your item(s) for sale to another customer. You will be refunded for the order, but the item(s) may no longer be available to you.', true),
  ('dn_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'STORE_PICKUP_AWAY'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'STORE_PICKUP_AWAY', 'Collect from the store within 14 - 16 working days', 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up your order within 14 - 16 working days after we’ve notified you. Your ₦1,000 store pickup fee is refunded when you collect.
However, if your order is not picked up within 14 - 16 working days after notification, we reserve the right to release your item(s) for sale to another customer. You will be refunded for the order, but the ₦1,000 store pickup fee is retained and the item(s) may no longer be available to you.', true)
ON CONFLICT ("spaceId", "key") DO UPDATE
SET "label" = EXCLUDED."label",
    "body" = EXCLUDED."body",
    "isCollapsible" = EXCLUDED."isCollapsible",
    "updatedAt" = CURRENT_TIMESTAMP;


INSERT INTO "delivery_zones" ("id", "spaceId", "state", "name", "fee", "deliveryType", "pickupAddress", "noteKey", "isPinned", "qualifiesForFreeShipping", "isActive", "sortOrder")
VALUES
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Iyana Ipaja, Egbeda, Agege'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Iyana Ipaja, Egbeda, Agege', 3000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ayobo, Alagbado, Ijaiye, Command, Alakuko, Abule-Egba'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ayobo, Alagbado, Ijaiye, Command, Alakuko, Abule-Egba', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Cele, Ilasa, Okota, Ago Palace, Apapa'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Cele, Ilasa, Okota, Ago Palace, Apapa', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Idimu, Ikotun, Ejigbo, Isolo, Ikeja'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Idimu, Ikotun, Ejigbo, Isolo, Ikeja', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ajao Estate'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ajao Estate', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Alagbole, Akute, Ajuwon'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Alagbole, Akute, Ajuwon', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Anthony, Ilupeju, Oshodi, Shomolu, Bariga, Oworonshoki'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Anthony, Ilupeju, Oshodi, Shomolu, Bariga, Oworonshoki', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Igbo Efon, Ologolo, Agungi, Jakande'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Igbo Efon, Ologolo, Agungi, Jakande', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ojota, Magodo, Ketu, Maryland, Shangisha'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ojota, Magodo, Ketu, Maryland, Shangisha', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ojuelegba, Yaba, Mushin, Surulere, Ebute Meta'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ojuelegba, Yaba, Mushin, Surulere, Ebute Meta', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Gbagada, Ifako-Gbagada'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Gbagada, Ifako-Gbagada', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Maza Maza, Festac, Mile 2'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Maza Maza, Festac, Mile 2', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ojodu, Ogba, Obawole, Iju Ishaga'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ojodu, Ogba, Obawole, Iju Ishaga', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Satellite Town, Iba, LASU, Ojo, Trade Fair, Iyana Ishashi, Isheri Oshun, Isheri Olofin, Ijegun'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Satellite Town, Iba, LASU, Ojo, Trade Fair, Iyana Ishashi, Isheri Oshun, Isheri Olofin, Ijegun', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Badore, Sangotedo, Langbasa, Awoyaya, Addo Road, Ikorodu, Thomas Estate'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Badore, Sangotedo, Langbasa, Awoyaya, Addo Road, Ikorodu, Thomas Estate', 5000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Balogun Market, Victoria Island, Ikoyi, Lagos Island, Lekki, OPIC'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Balogun Market, Victoria Island, Ikoyi, Lagos Island, Lekki, OPIC', 5000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Ikota, Eleganza, Ilaje, Orchid Road, VGC, Ajah, Ibeju Lekki, Ikate, County, Lakowe, Chevron, Osapa, Epe'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Ikota, Eleganza, Ilaje, Orchid Road, VGC, Ajah, Ibeju Lekki, Ikate, County, Lakowe, Chevron, Osapa, Epe', 6000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Lagos' || 'Badagry'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Lagos', 'Badagry', 7000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Abia' || 'Aba hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Abia', 'Aba hub pickup', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Abia' || 'Umuahia hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Abia', 'Umuahia hub pickup', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Apo hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Apo hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Bwari hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Bwari hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Gwagwalada hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Gwagwalada hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Gwarimpa hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Gwarimpa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Katampe hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Katampe hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Kubwa hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Kubwa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Kuje hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Kuje hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Lugbe hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Lugbe hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Utako hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Utako hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Federal Capital Territory' || 'Doorstep delivery'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Federal Capital Territory', 'Doorstep delivery', 10000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Adamawa' || 'Yola pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Adamawa', 'Yola pickup', 7500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Akwa Ibom' || 'Uyo hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Akwa Ibom', 'Uyo hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Akwa Ibom' || 'Eket hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Akwa Ibom', 'Eket hub pickup', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Anambra' || 'Awka hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Anambra', 'Awka hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Anambra' || 'Onitsha hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Anambra', 'Onitsha hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Anambra' || 'Nnewi hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Anambra', 'Nnewi hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Bauchi' || 'Bauchi pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Bauchi', 'Bauchi pickup', 7500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Bayelsa' || 'Yenagoa hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Bayelsa', 'Yenagoa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Benue' || 'Makurdi hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Benue', 'Makurdi hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Borno' || 'Maiduguri pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Borno', 'Maiduguri pickup', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Cross River' || 'Calabar'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Cross River', 'Calabar', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Asaba'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Asaba', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Warri'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Warri', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Agbor'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Agbor', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Sapele'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Sapele', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Ughelli'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Ughelli', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Delta' || 'Abraka'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Delta', 'Abraka', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ebonyi' || 'Abakaliki'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ebonyi', 'Abakaliki', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Edo' || 'Benin-1'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Edo', 'Benin-1', 5000.00, 'interstate_hub', 'Anayo Filling Station, beside Terminal Hotel and Resort, Oluku By-Pass junction, Ovbiogie Town, Benin', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Edo' || 'Benin-2'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Edo', 'Benin-2', 5000.00, 'interstate_hub', '120 Akpakpava Road, Youth House, Benin', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Edo' || 'Auchi'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Edo', 'Auchi', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Edo' || 'Ekpoma'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Edo', 'Ekpoma', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ekiti' || 'Ado-Ekiti'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ekiti', 'Ado-Ekiti', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Enugu' || 'Enugu-1'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Enugu', 'Enugu-1', 5000.00, 'interstate_hub', '122 Ogui Road, Enugu', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Enugu' || 'Enugu-2'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Enugu', 'Enugu-2', 5000.00, 'interstate_hub', 'No 207 Upper Chime, Opposite Sedar Medical Laboratory, New Heaven, Enugu', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Enugu' || 'Nsukka'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Enugu', 'Nsukka', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Gombe' || 'Gombe'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Gombe', 'Gombe', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Imo' || 'Owerri'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Imo', 'Owerri', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Imo' || 'Owerri-Nekede'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Imo', 'Owerri-Nekede', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Imo' || 'Mbaise'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Imo', 'Mbaise', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Jigawa' || 'Jigawa'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Jigawa', 'Jigawa', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kaduna' || 'Kaduna'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kaduna', 'Kaduna', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kaduna' || 'Zaria'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kaduna', 'Zaria', 9000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kano' || 'Kano'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kano', 'Kano', 6000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Katsina' || 'Katsina'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Katsina', 'Katsina', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kebbi' || 'Birnin-Kebbi'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kebbi', 'Birnin-Kebbi', 8500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kogi' || 'Lokoja'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kogi', 'Lokoja', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Kwara' || 'Ilorin'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Kwara', 'Ilorin', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Nasarawa' || 'Mararaba'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Nasarawa', 'Mararaba', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Nasarawa' || 'Lafia'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Nasarawa', 'Lafia', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Niger' || 'Zuba'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Niger', 'Zuba', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Abeokuta hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Abeokuta hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Agbara hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Agbara hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Ijebu-Ode hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Ijebu-Ode hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Mowe-Ibafo hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Mowe-Ibafo hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Sagamu hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Sagamu hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Sango-Otta hub pickup'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Sango-Otta hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Sango-Otta doorstep'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Sango-Otta doorstep', 5000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Mowe-Ibafo doorstep'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Mowe-Ibafo doorstep', 6000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ogun' || 'Agbara doorstep'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ogun', 'Agbara doorstep', 7000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ondo' || 'Akure'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ondo', 'Akure', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Ondo' || 'Ondo Town'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Ondo', 'Ondo Town', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Osun' || 'Osogbo'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Osun', 'Osogbo', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Osun' || 'Ile-Ife'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Osun', 'Ile-Ife', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Oyo' || 'Ibadan, New Life'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Oyo', 'Ibadan, New Life', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Oyo' || 'Ibadan, Bodija'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Oyo', 'Ibadan, Bodija', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Oyo' || 'Ibadan, Challenge'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Oyo', 'Ibadan, Challenge', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Oyo' || 'Ogbomoso'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Oyo', 'Ogbomoso', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Plateau' || 'Jos'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Plateau', 'Jos', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Rivers' || 'Eliozu'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Rivers', 'Eliozu', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Rivers' || 'Waterlines'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Rivers', 'Waterlines', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Rivers' || 'Wimpey'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Rivers', 'Wimpey', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Sokoto' || 'Sokoto'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Sokoto', 'Sokoto', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Taraba' || 'Jalingo'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Taraba', 'Jalingo', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Yobe' || 'Damaturu'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Yobe', 'Damaturu', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq0jd8860003mmuin73ludrk' || 'Zamfara' || 'Gusau'), 1, 24), 'cmq0jd8860003mmuin73ludrk', 'Zamfara', 'Gusau', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Iyana Ipaja, Egbeda, Agege'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Iyana Ipaja, Egbeda, Agege', 3000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ayobo, Alagbado, Ijaiye, Command, Alakuko, Abule-Egba'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ayobo, Alagbado, Ijaiye, Command, Alakuko, Abule-Egba', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Cele, Ilasa, Okota, Ago Palace, Apapa'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Cele, Ilasa, Okota, Ago Palace, Apapa', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Idimu, Ikotun, Ejigbo, Isolo, Ikeja'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Idimu, Ikotun, Ejigbo, Isolo, Ikeja', 3500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ajao Estate'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ajao Estate', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Alagbole, Akute, Ajuwon'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Alagbole, Akute, Ajuwon', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Anthony, Ilupeju, Oshodi, Shomolu, Bariga, Oworonshoki'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Anthony, Ilupeju, Oshodi, Shomolu, Bariga, Oworonshoki', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Igbo Efon, Ologolo, Agungi, Jakande'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Igbo Efon, Ologolo, Agungi, Jakande', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ojota, Magodo, Ketu, Maryland, Shangisha'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ojota, Magodo, Ketu, Maryland, Shangisha', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ojuelegba, Yaba, Mushin, Surulere, Ebute Meta'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ojuelegba, Yaba, Mushin, Surulere, Ebute Meta', 4000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Gbagada, Ifako-Gbagada'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Gbagada, Ifako-Gbagada', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Maza Maza, Festac, Mile 2'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Maza Maza, Festac, Mile 2', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ojodu, Ogba, Obawole, Iju Ishaga'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ojodu, Ogba, Obawole, Iju Ishaga', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Satellite Town, Iba, LASU, Ojo, Trade Fair, Iyana Ishashi, Isheri Oshun, Isheri Olofin, Ijegun'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Satellite Town, Iba, LASU, Ojo, Trade Fair, Iyana Ishashi, Isheri Oshun, Isheri Olofin, Ijegun', 4500.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Badore, Sangotedo, Langbasa, Awoyaya, Addo Road, Ikorodu, Thomas Estate'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Badore, Sangotedo, Langbasa, Awoyaya, Addo Road, Ikorodu, Thomas Estate', 5000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Balogun Market, Victoria Island, Ikoyi, Lagos Island, Lekki, OPIC'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Balogun Market, Victoria Island, Ikoyi, Lagos Island, Lekki, OPIC', 5000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Ikota, Eleganza, Ilaje, Orchid Road, VGC, Ajah, Ibeju Lekki, Ikate, County, Lakowe, Chevron, Osapa, Epe'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Ikota, Eleganza, Ilaje, Orchid Road, VGC, Ajah, Ibeju Lekki, Ikate, County, Lakowe, Chevron, Osapa, Epe', 6000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Lagos' || 'Badagry'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Lagos', 'Badagry', 7000.00, 'door_to_door', NULL, 'DOOR_TO_DOOR', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Abia' || 'Aba hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Abia', 'Aba hub pickup', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Abia' || 'Umuahia hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Abia', 'Umuahia hub pickup', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Apo hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Apo hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Bwari hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Bwari hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Gwagwalada hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Gwagwalada hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Gwarimpa hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Gwarimpa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Katampe hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Katampe hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Kubwa hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Kubwa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Kuje hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Kuje hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Lugbe hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Lugbe hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Utako hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Utako hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Federal Capital Territory' || 'Doorstep delivery'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Federal Capital Territory', 'Doorstep delivery', 10000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Adamawa' || 'Yola pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Adamawa', 'Yola pickup', 7500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Akwa Ibom' || 'Uyo hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Akwa Ibom', 'Uyo hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Akwa Ibom' || 'Eket hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Akwa Ibom', 'Eket hub pickup', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Anambra' || 'Awka hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Anambra', 'Awka hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Anambra' || 'Onitsha hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Anambra', 'Onitsha hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Anambra' || 'Nnewi hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Anambra', 'Nnewi hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Bauchi' || 'Bauchi pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Bauchi', 'Bauchi pickup', 7500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Bayelsa' || 'Yenagoa hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Bayelsa', 'Yenagoa hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Benue' || 'Makurdi hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Benue', 'Makurdi hub pickup', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Borno' || 'Maiduguri pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Borno', 'Maiduguri pickup', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Cross River' || 'Calabar'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Cross River', 'Calabar', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Asaba'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Asaba', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Warri'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Warri', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Agbor'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Agbor', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Sapele'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Sapele', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Ughelli'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Ughelli', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Delta' || 'Abraka'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Delta', 'Abraka', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ebonyi' || 'Abakaliki'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ebonyi', 'Abakaliki', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Edo' || 'Benin-1'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Edo', 'Benin-1', 5000.00, 'interstate_hub', 'Anayo Filling Station, beside Terminal Hotel and Resort, Oluku By-Pass junction, Ovbiogie Town, Benin', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Edo' || 'Benin-2'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Edo', 'Benin-2', 5000.00, 'interstate_hub', '120 Akpakpava Road, Youth House, Benin', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Edo' || 'Auchi'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Edo', 'Auchi', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Edo' || 'Ekpoma'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Edo', 'Ekpoma', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ekiti' || 'Ado-Ekiti'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ekiti', 'Ado-Ekiti', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Enugu' || 'Enugu-1'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Enugu', 'Enugu-1', 5000.00, 'interstate_hub', '122 Ogui Road, Enugu', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Enugu' || 'Enugu-2'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Enugu', 'Enugu-2', 5000.00, 'interstate_hub', 'No 207 Upper Chime, Opposite Sedar Medical Laboratory, New Heaven, Enugu', 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Enugu' || 'Nsukka'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Enugu', 'Nsukka', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Gombe' || 'Gombe'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Gombe', 'Gombe', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Imo' || 'Owerri'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Imo', 'Owerri', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Imo' || 'Owerri-Nekede'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Imo', 'Owerri-Nekede', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Imo' || 'Mbaise'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Imo', 'Mbaise', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Jigawa' || 'Jigawa'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Jigawa', 'Jigawa', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kaduna' || 'Kaduna'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kaduna', 'Kaduna', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kaduna' || 'Zaria'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kaduna', 'Zaria', 9000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kano' || 'Kano'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kano', 'Kano', 6000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Katsina' || 'Katsina'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Katsina', 'Katsina', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kebbi' || 'Birnin-Kebbi'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kebbi', 'Birnin-Kebbi', 8500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kogi' || 'Lokoja'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kogi', 'Lokoja', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Kwara' || 'Ilorin'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Kwara', 'Ilorin', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Nasarawa' || 'Mararaba'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Nasarawa', 'Mararaba', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Nasarawa' || 'Lafia'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Nasarawa', 'Lafia', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Niger' || 'Zuba'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Niger', 'Zuba', 7000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Abeokuta hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Abeokuta hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Agbara hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Agbara hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Ijebu-Ode hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Ijebu-Ode hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Mowe-Ibafo hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Mowe-Ibafo hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Sagamu hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Sagamu hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Sango-Otta hub pickup'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Sango-Otta hub pickup', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Sango-Otta doorstep'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Sango-Otta doorstep', 5000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Mowe-Ibafo doorstep'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Mowe-Ibafo doorstep', 6000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ogun' || 'Agbara doorstep'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ogun', 'Agbara doorstep', 7000.00, 'interstate_doorstep', NULL, 'INTERSTATE_DOORSTEP', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ondo' || 'Akure'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ondo', 'Akure', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Ondo' || 'Ondo Town'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Ondo', 'Ondo Town', 5500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Osun' || 'Osogbo'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Osun', 'Osogbo', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Osun' || 'Ile-Ife'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Osun', 'Ile-Ife', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Oyo' || 'Ibadan, New Life'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Oyo', 'Ibadan, New Life', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Oyo' || 'Ibadan, Bodija'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Oyo', 'Ibadan, Bodija', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Oyo' || 'Ibadan, Challenge'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Oyo', 'Ibadan, Challenge', 4000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, true, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Oyo' || 'Ogbomoso'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Oyo', 'Ogbomoso', 4500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Plateau' || 'Jos'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Plateau', 'Jos', 5000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Rivers' || 'Eliozu'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Rivers', 'Eliozu', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Rivers' || 'Waterlines'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Rivers', 'Waterlines', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Rivers' || 'Wimpey'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Rivers', 'Wimpey', 6500.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Sokoto' || 'Sokoto'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Sokoto', 'Sokoto', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Taraba' || 'Jalingo'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Taraba', 'Jalingo', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Yobe' || 'Damaturu'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Yobe', 'Damaturu', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0),
  ('dz_' || substr(md5('cmq35w5le0003fouibsm5vktc' || 'Zamfara' || 'Gusau'), 1, 24), 'cmq35w5le0003fouibsm5vktc', 'Zamfara', 'Gusau', 8000.00, 'interstate_hub', NULL, 'INTERSTATE_HUB', false, false, true, 0)
ON CONFLICT ("spaceId", "state", "name") DO UPDATE
SET "fee" = EXCLUDED."fee",
    "deliveryType" = EXCLUDED."deliveryType",
    "pickupAddress" = EXCLUDED."pickupAddress",
    "noteKey" = EXCLUDED."noteKey",
    "qualifiesForFreeShipping" = EXCLUDED."qualifiesForFreeShipping",
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;


-- 9. Store pickup. ---------------------------------------------------------
--
-- Free in Lagos, and 1,000 elsewhere taken as a refundable hold rather than a
-- fee, which is what routes it to orders.depositFee instead of shippingFee.
-- The hold days are the enforceable deadline; the window labels are the copy.
-- 16 is used for the away tier, the generous end of the stated "14 - 16".
-- Address is left null so it follows commerce_settings.storeAddress rather
-- than becoming a second copy of it that can drift.

INSERT INTO "store_pickup_settings" (
  "id", "spaceId", "isEnabled", "label", "address", "homeState",
  "homeFee", "homeWindowLabel", "homeHoldDays", "homeNoteKey",
  "awayFee", "awayFeeRefundable", "awayWindowLabel", "awayHoldDays", "awayNoteKey"
)
VALUES
  ('sp_' || substr(md5('cmq0jd8860003mmuin73ludrk'), 1, 24), 'cmq0jd8860003mmuin73ludrk', true, 'Store pickup', NULL, 'Lagos',
   0, '5-7 working days', 7, 'STORE_PICKUP_HOME',
   1000, true, '14 - 16 working days', 16, 'STORE_PICKUP_AWAY'),
  ('sp_' || substr(md5('cmq35w5le0003fouibsm5vktc'), 1, 24), 'cmq35w5le0003fouibsm5vktc', true, 'Store pickup', NULL, 'Lagos',
   0, '5-7 working days', 7, 'STORE_PICKUP_HOME',
   1000, true, '14 - 16 working days', 16, 'STORE_PICKUP_AWAY')
ON CONFLICT ("spaceId") DO UPDATE
SET "isEnabled" = EXCLUDED."isEnabled",
    "homeState" = EXCLUDED."homeState",
    "homeFee" = EXCLUDED."homeFee",
    "homeWindowLabel" = EXCLUDED."homeWindowLabel",
    "homeHoldDays" = EXCLUDED."homeHoldDays",
    "homeNoteKey" = EXCLUDED."homeNoteKey",
    "awayFee" = EXCLUDED."awayFee",
    "awayFeeRefundable" = EXCLUDED."awayFeeRefundable",
    "awayWindowLabel" = EXCLUDED."awayWindowLabel",
    "awayHoldDays" = EXCLUDED."awayHoldDays",
    "awayNoteKey" = EXCLUDED."awayNoteKey",
    "updatedAt" = CURRENT_TIMESTAMP;


COMMIT;


-- Verification, safe to run separately.
--
--   SELECT "spaceId", "deliveryType", count(*), min("fee"), max("fee")
--   FROM "delivery_zones" GROUP BY 1, 2 ORDER BY 1, 2;
--     -> 18 door_to_door, 74 interstate_hub, 4 interstate_doorstep per space
--
--   SELECT count(*) FROM "delivery_zones" WHERE "state" = '';        -> 0
--   SELECT count(*) FROM "delivery_zones" WHERE "qualifiesForFreeShipping";
--     -> 19 per space
--   SELECT "orderNumber", "deliveryLabel", "deliveryZoneId" FROM "orders"
--   WHERE "deliveryLabel" IS NOT NULL;
--     -> the three SF-20260828 orders keep Alimosho / Apapa, zone id now null
