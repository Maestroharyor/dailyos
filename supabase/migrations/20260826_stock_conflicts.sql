-- Stock discrepancies a sale left behind.
--
-- The policy is accept the sale, flag the discrepancy — never refuse. A sale
-- rung offline has already happened: the customer has the goods and the cash
-- is in the drawer, so refusing it at sync destroys a real transaction to
-- protect a number. This table is where the number's disagreement is recorded
-- so somebody can go and look.
--
-- Applied via Supabase MCP `apply_migration` (prisma db push is blocked by the
-- cross-schema FK, P4002). Additive: a new table and nothing else.
--
-- timestamp(3) rather than timestamptz, matching Prisma's DateTime default and
-- every other timestamp column in this schema. Mixing the two is how a report
-- ends up an hour out twice a year.

CREATE TABLE IF NOT EXISTS "stock_conflicts" (
  "id"              text PRIMARY KEY,
  "spaceId"         text NOT NULL,
  "orderId"         text NOT NULL,
  "productId"       text NOT NULL,
  "variantId"       text,
  -- Null when the line had no inventory item to move stock against.
  "inventoryItemId" text,
  -- oversell | missing_inventory_item
  "kind"            text NOT NULL,
  "quantityOrdered" integer NOT NULL,
  "stockBefore"     integer NOT NULL,
  "stockAfter"      integer NOT NULL,
  -- pos | storefront | sync — so a run of these after an outage is
  -- recognisable as one rather than looking like a bad afternoon.
  "source"          text NOT NULL,

  "resolvedAt"      timestamp(3),
  "resolvedById"    text,
  "resolutionNote"  text,

  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "stock_conflicts_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_conflicts_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_conflicts_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "stock_conflicts_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL,
  CONSTRAINT "stock_conflicts_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL
);

-- The sync screen reads open conflicts for one space; the order detail reads
-- them for one order.
CREATE INDEX IF NOT EXISTS "stock_conflicts_spaceId_resolvedAt_idx"
  ON "stock_conflicts" ("spaceId", "resolvedAt");

CREATE INDEX IF NOT EXISTS "stock_conflicts_orderId_idx"
  ON "stock_conflicts" ("orderId");
