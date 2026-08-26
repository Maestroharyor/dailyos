/**
 * Import the VKT bag catalog into the real "VKT" space.
 *
 * Runs read-only by default; pass --commit to write. Re-running is safe: image
 * objects upsert to a deterministic storage path and the script refuses to
 * touch a SKU that already exists, so stock movements can never be doubled.
 *
 *   bun run scripts/vkt-import-catalog.ts            # dry run
 *   bun run scripts/vkt-import-catalog.ts --commit   # write
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { createAdminClient } from "../src/lib/supabase/admin";
import { slugify, ensureUniqueProductSlug } from "../src/lib/utils/slug";
import { CATALOG, SOURCE_IMAGE_DIR, landedCost, totalUnits, type CatalogItem } from "./vkt-catalog";

const SPACE_NAME = "VKT";
const CATEGORY_NAME = "Bags";
const COMMIT = process.argv.includes("--commit");

function variantSku(item: CatalogItem, color: string): string {
  return `${item.sku}-${slugify(color).toUpperCase()}`;
}

/** Upload one source photo to the public `media` bucket, returning its public URL. */
async function uploadImage(spaceId: string, item: CatalogItem): Promise<string | null> {
  if (!item.image) return null;
  const source = path.join(SOURCE_IMAGE_DIR, item.image);
  const body = await readFile(source);
  // Deterministic path keyed by SKU so a re-run overwrites rather than orphans.
  const objectPath = `${spaceId}/products/${item.sku.toLowerCase()}.jpg`;

  if (!COMMIT) return `https://<dry-run>/${objectPath}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("media")
    .upload(objectPath, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload ${item.sku}: ${error.message}`);

  const { data } = admin.storage.from("media").getPublicUrl(objectPath);
  return data.publicUrl;
}

async function main() {
  const space = await prisma.space.findFirst({
    where: { name: SPACE_NAME },
    select: { id: true, name: true },
  });
  if (!space) throw new Error(`Space "${SPACE_NAME}" not found`);

  const clashes = await prisma.product.findMany({
    where: { spaceId: space.id, sku: { in: CATALOG.map((i) => i.sku) } },
    select: { sku: true },
  });
  if (clashes.length) {
    throw new Error(
      `Refusing to run: these SKUs already exist in ${space.name} — ` +
        clashes.map((c) => c.sku).join(", "),
    );
  }

  console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} -> ${space.name} (${space.id})\n`);

  // Category
  let categoryId: string;
  const existingCategory = await prisma.category.findFirst({
    where: { spaceId: space.id, slug: slugify(CATEGORY_NAME) },
    select: { id: true },
  });
  if (existingCategory) {
    categoryId = existingCategory.id;
    console.log(`category "${CATEGORY_NAME}" reused (${categoryId})`);
  } else if (COMMIT) {
    const created = await prisma.category.create({
      data: { spaceId: space.id, name: CATEGORY_NAME, slug: slugify(CATEGORY_NAME) },
      select: { id: true },
    });
    categoryId = created.id;
    console.log(`category "${CATEGORY_NAME}" created (${categoryId})`);
  } else {
    categoryId = "<dry-run-category>";
    console.log(`category "${CATEGORY_NAME}" would be created`);
  }
  console.log("");

  let published = 0;
  let drafted = 0;
  let units = 0;

  for (const item of CATALOG) {
    const cost = landedCost(item);
    // Unpriced items are parked at landed cost so the required positive price
    // is satisfied without inventing a margin. They stay drafts.
    const price = item.price ?? cost;
    const isPriced = item.price !== null;
    const status = item.publish ? "active" : "draft";
    const qty = totalUnits(item);
    units += qty;
    item.publish ? published++ : drafted++;

    const imageUrl = await uploadImage(space.id, item);
    const slug = COMMIT ? await ensureUniqueProductSlug(space.id, item.name) : slugify(item.name);

    const label =
      `${item.sku}  ${item.name.padEnd(36)} ` +
      `cost=${cost} price=${price}${item.salePrice ? ` sale=${item.salePrice}` : ""}` +
      `${isPriced ? "" : " [UNPRICED]"} ${status}${item.publish ? "+published" : ""} ` +
      `qty=${qty} variants=${item.colors.length || "-"}${imageUrl ? "" : " NO-IMAGE"}`;
    console.log(label);
    if (item.notes) console.log(`        note: ${item.notes}`);

    if (!COMMIT) continue;

    const product = await prisma.product.create({
      data: {
        spaceId: space.id,
        categoryId,
        sku: item.sku,
        slug,
        name: item.name,
        description: item.description,
        price,
        costPrice: cost,
        salePrice: item.salePrice ?? null,
        onSale: item.salePrice !== undefined,
        status,
        isPublished: item.publish,
        tags: ["bag", "handbag"],
        images: imageUrl
          ? { create: [{ url: imageUrl, alt: item.name, isPrimary: true, sortOrder: 0 }] }
          : undefined,
        variants: item.colors.length
          ? {
              create: item.colors.map((c) => ({
                sku: variantSku(item, c.color),
                name: c.color,
                price,
                costPrice: cost,
                attributes: { color: c.color, size: item.size },
              })),
            }
          : undefined,
        productTags: {
          create: [
            { type: "size" as const, value: item.size },
            ...item.colors.map((c) => ({ type: "color" as const, value: c.color })),
          ],
        },
      },
      include: { variants: true },
    });

    // One inventory item per variant, or a single item when the batch is
    // unsorted, then a stock_in movement carrying that line's quantity.
    if (product.variants.length) {
      const qtyByVariantSku = new Map(item.colors.map((c) => [variantSku(item, c.color), c.qty]));
      for (const variant of product.variants) {
        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            spaceId: space.id,
            productId: product.id,
            variantId: variant.id,
            location: "default",
          },
        });
        await prisma.inventoryMovement.create({
          data: {
            inventoryItemId: inventoryItem.id,
            type: "stock_in",
            quantity: qtyByVariantSku.get(variant.sku) ?? 0,
            costAtTime: cost,
            referenceType: "purchase",
            notes: "Opening stock - VKT catalog import",
          },
        });
      }
    } else {
      const inventoryItem = await prisma.inventoryItem.create({
        data: { spaceId: space.id, productId: product.id, location: "default" },
      });
      await prisma.inventoryMovement.create({
        data: {
          inventoryItemId: inventoryItem.id,
          type: "stock_in",
          quantity: qty,
          costAtTime: cost,
          referenceType: "purchase",
          notes: "Opening stock - VKT catalog import (unsorted batch)",
        },
      });
    }
  }

  console.log(
    `\n${CATALOG.length} products | ${published} active+published, ${drafted} draft | ${units} units`,
  );
  if (!COMMIT) console.log("Dry run only. Re-run with --commit to write.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
