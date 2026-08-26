-- clientRequestId for the admin entities that can be created offline.
--
-- Same contract as orders/customers/inventory_movements (see
-- 20260826_client_request_id.sql): a nullable key minted on the device before
-- the write leaves it, so a queued create dispatched twice resolves to one
-- row. Nullable because everything already in these tables predates the
-- outbox, and Postgres treats NULLs as distinct in a unique index, so any
-- number of rows may have none.
--
-- APPLIED 2026-08-26. All four indexes verified indisvalid.

ALTER TABLE "products"   ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "suppliers"  ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "expenses"   ADD COLUMN IF NOT EXISTS "clientRequestId" text;

-- Each of these must be run on its own: CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block, and a failed concurrent build leaves an INVALID
-- index behind that has to be dropped before retrying. CONCURRENTLY rather
-- than a plain build because products is the largest table in a live shop and
-- an ACCESS EXCLUSIVE lock on it stops the till.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "products_spaceId_clientRequestId_key"
  ON "products" ("spaceId", "clientRequestId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "categories_spaceId_clientRequestId_key"
  ON "categories" ("spaceId", "clientRequestId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "suppliers_spaceId_clientRequestId_key"
  ON "suppliers" ("spaceId", "clientRequestId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "expenses_spaceId_clientRequestId_key"
  ON "expenses" ("spaceId", "clientRequestId");
