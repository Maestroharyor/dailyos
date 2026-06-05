-- Populate Product.slug for rows that don't have one yet, and deduplicate
-- collisions in the SAME statement so the end-of-statement unique-constraint
-- check sees only unique values. Postgres unique constraints are NOT
-- DEFERRABLE by default; a naive two-pass UPDATE+UPDATE aborts on step 1
-- the moment two NULL-slug rows derive the same value.
--
-- Idempotent: re-running is a no-op once all rows have unique slugs.
--
-- Usage (from dailyos/ root):
--   psql "$DATABASE_URL" -f scripts/backfill-product-slugs.sql
--
-- Run AFTER `bun run db:push` adds the column + constraint. The slugify regex
-- matches dailyos/src/lib/utils/slug.ts::slugify exactly; if that function
-- changes, update this SQL.

BEGIN;

-- Pass 1: populate every NULL slug with a UNIQUE derived value.
--
-- CTE pipeline:
--   `base`      — strip non-alphanumerics, collapse to dashes (matches slugify)
--   `coalesced` — replace empty base with the literal 'item'
--   `numbered`  — assign a stable row number within (space_id, base_slug)
--   final UPDATE — first row keeps the base, others get `-1`, `-2`, ... so
--                  the final state is collision-free WITHIN this statement.
WITH base AS (
    SELECT
        id,
        space_id,
        REGEXP_REPLACE(
            REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        ) AS raw_slug
    FROM products
    WHERE slug IS NULL
),
coalesced AS (
    SELECT id, space_id,
           CASE WHEN raw_slug = '' THEN 'item' ELSE raw_slug END AS base_slug
    FROM base
),
numbered AS (
    SELECT id, space_id, base_slug,
           ROW_NUMBER() OVER (PARTITION BY space_id, base_slug ORDER BY id) - 1 AS suffix
    FROM coalesced
)
UPDATE products p
SET slug = CASE
    WHEN n.suffix = 0 THEN n.base_slug
    ELSE n.base_slug || '-' || n.suffix::text
END
FROM numbered n
WHERE p.id = n.id;

-- Pass 2: dedupe any pre-existing non-null slugs that collide with each
-- other (e.g. admin manually set duplicates before the constraint existed,
-- or pass-1-assigned slugs collide with pre-existing manual slugs). Same
-- single-statement pattern so end-of-statement uniqueness is preserved.
WITH numbered AS (
    SELECT
        id,
        space_id,
        slug,
        ROW_NUMBER() OVER (
            PARTITION BY space_id, slug
            ORDER BY created_at, id
        ) - 1 AS suffix
    FROM products
    WHERE slug IS NOT NULL
)
UPDATE products p
SET slug = n.slug || '-' || SUBSTRING(p.id, 1, 6)
FROM numbered n
WHERE p.id = n.id
  AND n.suffix > 0;

COMMIT;
