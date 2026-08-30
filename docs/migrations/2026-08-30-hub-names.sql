-- Drop the word "pickup" from the interstate hub option names.
--
-- Checkout now groups options under three tabs, one of which is "Pickup" and
-- means collecting from the shop. Leaving 27 carriage options named "... hub
-- pickup" put the same word on two things that carry different rules: store
-- pickup is free in Lagos, refundable elsewhere, and held for a fixed number of
-- working days; a hub is a courier's depot with its own late-collection
-- charges. "Aba hub" says what it is without borrowing the other one's name.
--
-- Two shapes, 27 rows per space:
--   24 end in " hub pickup"  -> strip the suffix        ("Aba hub pickup" -> "Aba hub")
--    3 end in " pickup" only -> replace it with " hub"  ("Yola pickup"    -> "Yola hub")
-- The other 47 hub rows never carried the word and are untouched.
--
-- Idempotent: both statements are guarded on the name still ending the way they
-- match, so a second run updates nothing. Verified against the seed data that
-- no (spaceId, state, new name) collides with an existing row, which matters
-- because "delivery_zones_spaceId_state_name_key" is unique.
--
-- Order history is unaffected. Orders snapshot the option name into
-- "orders"."deliveryLabel" at checkout, so a past order keeps the name the
-- customer actually saw, and nothing joins on "delivery_zones"."name".

BEGIN;

-- 1. "<X> hub pickup" -> "<X> hub"   (expect 24 per space, 48 total)
UPDATE "delivery_zones"
   SET "name" = left("name", length("name") - length(' pickup')),
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "deliveryType" = 'interstate_hub'
   AND "name" LIKE '% hub pickup';

-- 2. "<City> pickup" -> "<City> hub"  (expect 3 per space, 6 total:
--    Yola / Adamawa, Bauchi / Bauchi, Maiduguri / Borno)
UPDATE "delivery_zones"
   SET "name" = left("name", length("name") - length(' pickup')) || ' hub',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "deliveryType" = 'interstate_hub'
   AND "name" LIKE '% pickup'
   AND "name" NOT LIKE '% hub pickup';

-- Fail the whole transaction rather than leave a half-renamed catalog behind.
DO $$
DECLARE
  remaining int;
  hubs int;
BEGIN
  SELECT count(*) INTO remaining FROM "delivery_zones" WHERE "name" ILIKE '%pickup%';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'expected no zone name to still contain "pickup", found %', remaining;
  END IF;

  SELECT count(*) INTO hubs
    FROM "delivery_zones"
   WHERE "deliveryType" = 'interstate_hub' AND "name" LIKE '% hub';
  IF hubs < 54 THEN
    RAISE EXCEPTION 'expected at least 54 renamed hub rows across both spaces, found %', hubs;
  END IF;
END $$;

COMMIT;

-- Read back:
--   SELECT count(*) FROM "delivery_zones" WHERE "name" ILIKE '%pickup%';        -> 0
--   SELECT "spaceId", count(*) FROM "delivery_zones"
--    WHERE "deliveryType" = 'interstate_hub' GROUP BY 1;                        -> 74 per space
--   SELECT "orderNumber", "deliveryLabel" FROM "orders" ORDER BY 1;             -> unchanged
