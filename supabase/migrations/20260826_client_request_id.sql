-- Idempotency keys for the writes that must survive being sent twice.
--
-- `prisma db push` is blocked on this project by the cross-schema FK
-- (public.profiles -> auth.users) and errors with P4002, so DDL is applied
-- through the Supabase MCP `apply_migration` instead. This file is the
-- statement of record for what was applied.
--
-- Applied in two parts: the three ALTER TABLEs can go in one transaction, the
-- three CREATE INDEX CONCURRENTLYs cannot (see the note below them).
--
-- Additive and reversible: three nullable columns and three unique indexes.
-- Every existing row keeps NULL, and Postgres unique indexes do not constrain
-- NULLs, so any number of pre-existing rows coexist happily.

ALTER TABLE "orders"              ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "customers"           ADD COLUMN IF NOT EXISTS "clientRequestId" text;
ALTER TABLE "inventory_movements" ADD COLUMN IF NOT EXISTS "clientRequestId" text;

-- The unique index IS the lookup index — the replay path reads by exactly
-- these columns, so no separate index is needed.
--
-- CONCURRENTLY because these are the three tables a trading shop can least
-- afford to have writes stall on. A plain CREATE INDEX takes a lock for the
-- whole build, and orders is exactly the table someone is inserting into while
-- this runs.
--
-- ⚠️ CONCURRENTLY cannot run inside a transaction block. Each statement below
-- must be sent on its own — Supabase MCP `apply_migration` wraps its input in
-- a transaction, so run these three through `execute_sql` one at a time, or
-- from the SQL editor with the rest of this file applied first.
--
-- ⚠️ A failed CONCURRENTLY build leaves an INVALID index behind that still
-- costs write time and enforces nothing. After running, check:
--
--   SELECT indexrelid::regclass, indisvalid FROM pg_index
--   WHERE NOT indisvalid;
--
-- Drop and re-run anything that comes back.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "orders_spaceId_clientRequestId_key"
  ON "orders" ("spaceId", "clientRequestId");

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "customers_spaceId_clientRequestId_key"
  ON "customers" ("spaceId", "clientRequestId");

-- inventory_movements has no spaceId — movements hang off inventory items.
-- The value is a ULID, so a global unique is both correct and stronger than a
-- per-space one would be.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "inventory_movements_clientRequestId_key"
  ON "inventory_movements" ("clientRequestId");
