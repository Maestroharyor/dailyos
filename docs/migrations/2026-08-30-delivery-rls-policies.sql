-- Let the storefront's read-only role see the two tables RLS is switched on for.
--
-- delivery_notes and store_pickup_settings have RLS enabled with no policy on
-- them, which is deny-all for any role without BYPASSRLS. DailyOS connects as
-- `postgres`, which has rolbypassrls, so the admin UI reads and writes them
-- normally and the problem was invisible from that side. VKT connects as
-- `vktbougie_reader`, which does not, so getDeliveryCatalog's three-way
-- Promise.all came back with 96 zones, 0 notes and no pickup row - silently,
-- because RLS returns no rows rather than an error.
--
-- The visible result at checkout was a state showing its carriage options with
-- no terms under any of them and no store pickup offered anywhere.
--
-- Adding a policy rather than switching RLS off. The seven sibling catalog
-- tables the same role reads (products, categories, delivery_zones,
-- commerce_settings, sale_events, reviews, spaces) all have RLS off, so
-- matching them would be the consistent move - but `anon` holds SELECT on all
-- of these, so RLS off is what makes a table readable through PostgREST with
-- the publishable key. These two are currently the only ones closed to that,
-- and widening them to match the others would be the wrong direction. The
-- policy names the reader role explicitly and leaves anon denied.
--
-- USING (true) rather than a spaceId predicate: the role is already confined by
-- grants, the application filters by spaceId on every query, and a row-level
-- rule here would still be looser than the one the siblings do not have at all.

BEGIN;

DROP POLICY IF EXISTS "storefront_reader_select" ON public."delivery_notes";
CREATE POLICY "storefront_reader_select"
    ON public."delivery_notes"
    FOR SELECT
    TO vktbougie_reader
    USING (true);

DROP POLICY IF EXISTS "storefront_reader_select" ON public."store_pickup_settings";
CREATE POLICY "storefront_reader_select"
    ON public."store_pickup_settings"
    FOR SELECT
    TO vktbougie_reader
    USING (true);

COMMIT;

-- Read back, as vktbougie_reader rather than as postgres, because postgres
-- bypasses RLS and would have reported success all along:
--   SELECT count(*) FROM "delivery_notes";          -> 10
--   SELECT count(*) FROM "store_pickup_settings";   -> 2
