-- Shorten the two store pickup note bodies.

-- The terms rendered as five sentences of small grey text under a row the
-- shopper had not chosen yet, and said 1,000 three times over: once as the
-- price, once as the deposit line, once inside the prose. The row now carries
-- the amount in the price column and a plain "Refunded when you collect" line,
-- so the note only has to cover the deadline and what happens after it.
--
-- 483 characters to 249, and 370 to 219.
--
-- ⚠️ This changes the terms a customer agrees to at checkout, not just their
-- presentation. "we reserve the right to release your item(s) for sale" was a
-- right reserved; "your order is cancelled and the item goes back on sale" is a
-- statement of what happens. That is a stronger commitment and a deliberate
-- one, made by the shop owner.
--
-- The AWAY body keeps "but not the ₦1,000" because the away pickup fee is a
-- non-refunded charge once the window passes. The HOME body says "refunded in
-- full" because home pickup is free: store_pickup_settings.homeFee is 0.00,
-- so there is no fee to withhold.
--
-- Punctuation is deliberate and matches the rest of the catalog copy: a curly
-- apostrophe in YOU’LL and You’ll, an en dash in 5–7, a spaced hyphen in
-- 14 - 16, and the naira sign rather than NGN.
--
-- Idempotent: re-running writes the same text. Safe on a live database; past
-- orders are unaffected because nothing snapshots a note body.

BEGIN;

-- 1. Away from the home state: a fee that is kept if the window passes. ------
UPDATE "delivery_notes"
   SET "body" = 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up within 14 - 16 working days of that email. After that your order is cancelled and the item goes back on sale to another customer. You’ll be refunded for the order, but not the ₦1,000.',
       "updatedAt" = now()
 WHERE "key" = 'STORE_PICKUP_AWAY';

-- 2. In the home state: free, so the refund is whole. ------------------------
UPDATE "delivery_notes"
   SET "body" = 'STORE PICKUP WHEN YOUR ORDER IS READY (YOU’LL BE EMAILED)
Pick up within 5–7 working days of that email. After that your order is cancelled and the item goes back on sale to another customer. You’ll be refunded in full.',
       "updatedAt" = now()
 WHERE "key" = 'STORE_PICKUP_HOME';

-- Fail rather than leave one space on the old terms and one on the new.
DO $$
DECLARE
  away int;
  home int;
  stale int;
BEGIN
  SELECT count(*) INTO away FROM "delivery_notes"
   WHERE "key" = 'STORE_PICKUP_AWAY' AND length("body") = 249;
  IF away <> 2 THEN
    RAISE EXCEPTION 'expected 2 rewritten STORE_PICKUP_AWAY rows, one per space, found %', away;
  END IF;

  SELECT count(*) INTO home FROM "delivery_notes"
   WHERE "key" = 'STORE_PICKUP_HOME' AND length("body") = 219;
  IF home <> 2 THEN
    RAISE EXCEPTION 'expected 2 rewritten STORE_PICKUP_HOME rows, one per space, found %', home;
  END IF;

  SELECT count(*) INTO stale FROM "delivery_notes" WHERE "body" LIKE '%reserve the right%';
  IF stale <> 0 THEN
    RAISE EXCEPTION 'expected no note to still reserve a right, found %', stale;
  END IF;
END $$;

COMMIT;

-- Read back:
--   SELECT "key", length("body") FROM "delivery_notes"
--    WHERE "key" LIKE 'STORE_PICKUP%';                    -> 249 and 219, twice each
--   SELECT count(*) FROM "delivery_notes"
--    WHERE "body" LIKE '%reserve the right%';             -> 0
--   SELECT count(*) FROM "delivery_notes";                -> 10, unchanged
