-- Partial unique indexes for the rows a compound unique cannot reach.
--
-- Both `wishlist_items` and `inventory_items` declare a unique across a column
-- that is nullable:
--
--   @@unique([wishlistId, productId, variantId])
--   @@unique([spaceId, productId, variantId, location])
--
-- Postgres treats NULLs as distinct in a unique index, so neither constrains a
-- row where variantId IS NULL. That is the common case: a product without
-- variants stores NULL there. The practical effect is that two concurrent
-- writes for the same product both insert, and no constraint violation fires
-- for the application to catch.
--
-- Application code cannot close this. The catch-P2002 in the wishlist route and
-- the ON CONFLICT DO NOTHING in ensureInventoryItem both depend on a constraint
-- that, for these rows, does not exist. These indexes create it.
--
-- Run against DIRECT_URL (:5432), not the pooled :6543 endpoint.
--
-- CONCURRENTLY so neither table is write-locked while the index builds. That
-- means each statement must run on its own, outside a transaction block.

-- Wishlist: one row per (wishlist, product) when no variant is chosen.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS wishlist_items_no_variant_key
  ON wishlist_items ("wishlistId", "productId")
  WHERE "variantId" IS NULL;

-- Inventory: one row per (space, product, location) when no variant is chosen.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS inventory_items_no_variant_key
  ON inventory_items ("spaceId", "productId", location)
  WHERE "variantId" IS NULL;

-- If either fails with a duplicate key error, the duplicates it is meant to
-- prevent already exist and have to be collapsed first. To find them:
--
--   SELECT "wishlistId", "productId", count(*)
--   FROM wishlist_items WHERE "variantId" IS NULL
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
--   SELECT "spaceId", "productId", location, count(*)
--   FROM inventory_items WHERE "variantId" IS NULL
--   GROUP BY 1, 2, 3 HAVING count(*) > 1;
--
-- Wishlist duplicates can simply be deleted down to one row. Inventory
-- duplicates must NOT be: each carries its own inventory_movements, and
-- deleting a row deletes its movements and changes the stock total. Re-point
-- the movements at the surviving item first, then delete the empty rows.
