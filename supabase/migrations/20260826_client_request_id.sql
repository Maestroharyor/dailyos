-- Idempotency keys for the writes that must survive being sent twice.
--
-- `prisma db push` is blocked on this project by the cross-schema FK
-- (public.profiles -> auth.users) and errors with P4002, so DDL is applied
-- through the Supabase MCP `apply_migration` instead. This file is the
-- statement of record for what was applied.
--
-- Additive and reversible: three nullable columns and three unique indexes.
-- Every existing row keeps NULL, and Postgres unique indexes do not constrain
-- NULLs, so any number of pre-existing rows coexist happily.

ALTER TABLE "orders"              ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "customers"           ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "clientRequestId" text;

-- The unique index IS the lookup index — the replay path reads by exactly
-- these columns, so no separate index is needed.
CREATE UNIQUE INDEX IF NOT EXISTS "orders_spaceId_clientRequestId_key"
  ON "orders" ("spaceId", "clientRequestId");

CREATE UNIQUE INDEX IF NOT EXISTS "customers_spaceId_clientRequestId_key"
  ON "customers" ("spaceId", "clientRequestId");

-- inventory_movements has no spaceId — movements hang off inventory items.
-- The value is a ULID, so a global unique is both correct and stronger than a
-- per-space one would be.
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movements_clientRequestId_key"
  ON "inventory_movements" ("clientRequestId");
