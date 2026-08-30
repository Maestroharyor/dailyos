-- Let a product image belong to one variant.
--
-- Until now product_images had only productId, so the storefront could not
-- change the picture when a shopper picked a different colour: every image
-- belonged to the product as a whole.
--
-- variantId is nullable and that is load-bearing, not laziness. Null means
-- "this is a picture of the product, whichever variant is selected", which is
-- exactly what every row written before this migration is. The storefront
-- falls back to those when the selected variant has no images of its own, so a
-- catalog where only some colours have been photographed degrades to the
-- product gallery rather than to an empty frame.
--
-- ON DELETE SET NULL rather than CASCADE: deleting a variant should not delete
-- photographs. They fall back to being product-level images, which is both
-- recoverable and the safer failure.
--
-- Idempotent. Re-running changes nothing.

BEGIN;

ALTER TABLE "product_images" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_images_variantId_fkey'
  ) THEN
    ALTER TABLE "product_images"
      ADD CONSTRAINT "product_images_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "product_images_variantId_idx" ON "product_images"("variantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'product_images' AND column_name = 'variantId'
  ) THEN
    RAISE EXCEPTION 'product_images.variantId was not created';
  END IF;
  -- Every pre-existing row must stay product-level. A migration that silently
  -- attached old photographs to an arbitrary variant would be far worse than
  -- one that failed.
  IF EXISTS (SELECT 1 FROM "product_images" WHERE "variantId" IS NOT NULL) THEN
    RAISE NOTICE 'some product_images already carry a variantId; this is expected only on a re-run';
  END IF;
END $$;

COMMIT;
