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
import { ensureUniqueProductSlug, slugify } from "../src/lib/utils/slug";
import {
  ALL_ITEMS,
  type CatalogItem,
  landedCost,
  SOURCE_IMAGE_DIR,
  totalUnits,
} from "./vkt-catalog";

const SPACE_NAME = "VKT";
const DEFAULT_CATEGORY = "Bags";
const DEFAULT_TAGS = ["bag", "handbag"];
const COMMIT = process.argv.includes("--commit");

function variantSku(item: CatalogItem, value: string): string {
  return `${item.sku}-${slugify(value).toUpperCase()}`;
}

/**
 * The variants for one item, on whichever axis it actually varies.
 *
 * A bag varies by colour and a shoe by size, and the attribute key has to say
 * which: putting "39" in a colour attribute would be wrong in the database and
 * wrong on the storefront's variant picker.
 */
function variantLines(item: CatalogItem): { value: string; qty: number; axis: "color" | "size" }[] {
  if (item.colors.length)
    return item.colors.map((c) => ({ value: c.color, qty: c.qty, axis: "color" as const }));
  if (item.sizes?.length)
    return item.sizes.map((v) => ({ value: v.size, qty: v.qty, axis: "size" as const }));
  return [];
}

/** Upload one source photo to the public `media` bucket, returning its public URL. */
async function uploadImage(spaceId: string, item: CatalogItem): Promise<string | null> {
  if (!item.image) return null;
  const source = path.join(item.imageDir ?? SOURCE_IMAGE_DIR, item.image);
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

  // Skip rather than abort. The guarantee worth keeping is that an existing SKU
  // is never touched, so stock movements cannot be doubled; refusing the whole
  // run for it also made the script single-use, which is why the shoes could
  // not be added alongside the already-imported bags.
  const existing = new Set(
    (
      await prisma.product.findMany({
        where: { spaceId: space.id, sku: { in: ALL_ITEMS.map((i) => i.sku) } },
        select: { sku: true },
      })
    ).map((p) => p.sku)
  );
  const items = ALL_ITEMS.filter((i) => !existing.has(i.sku));
  if (existing.size) {
    console.log(
      `skipping ${existing.size} SKU(s) already in ${space.name}: ${[...existing].join(", ")}\n`
    );
  }
  if (!items.length) {
    console.log("Nothing new to import.");
    return;
  }

  console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} -> ${space.name} (${space.id})\n`);

  // Categories, resolved once per distinct name. Bags already exists; Shoes
  // does not, so the first shoe creates it.
  const categoryIds = new Map<string, string>();
  for (const name of new Set(items.map((i) => i.category ?? DEFAULT_CATEGORY))) {
    const found = await prisma.category.findFirst({
      where: { spaceId: space.id, slug: slugify(name) },
      select: { id: true },
    });
    if (found) {
      categoryIds.set(name, found.id);
      console.log(`category "${name}" reused (${found.id})`);
    } else if (COMMIT) {
      const created = await prisma.category.create({
        data: { spaceId: space.id, name, slug: slugify(name) },
        select: { id: true },
      });
      categoryIds.set(name, created.id);
      console.log(`category "${name}" created (${created.id})`);
    } else {
      categoryIds.set(name, `<dry-run-${slugify(name)}>`);
      console.log(`category "${name}" would be created`);
    }
  }
  console.log("");

  let published = 0;
  let drafted = 0;
  let units = 0;

  for (const item of items) {
    const cost = landedCost(item);
    // Unpriced items are parked at landed cost so the required positive price
    // is satisfied without inventing a margin. They stay drafts.
    const price = item.price ?? cost;
    const isPriced = item.price !== null;
    const status = item.publish ? "active" : "draft";
    const qty = totalUnits(item);
    const lines = variantLines(item);
    const categoryId = categoryIds.get(item.category ?? DEFAULT_CATEGORY) ?? "";
    units += qty;
    item.publish ? published++ : drafted++;

    const imageUrl = await uploadImage(space.id, item);
    const slug = COMMIT ? await ensureUniqueProductSlug(space.id, item.name) : slugify(item.name);

    const label =
      `${item.sku}  ${item.name.padEnd(36)} ` +
      `cost=${cost} price=${price}${item.salePrice ? ` sale=${item.salePrice}` : ""}` +
      `${isPriced ? "" : " [UNPRICED]"} ${status}${item.publish ? "+published" : ""} ` +
      `qty=${qty} variants=${lines.length || "-"}${imageUrl ? "" : " NO-IMAGE"}`;
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
        tags: item.tags ?? DEFAULT_TAGS,
        images: imageUrl
          ? { create: [{ url: imageUrl, alt: item.name, isPrimary: true, sortOrder: 0 }] }
          : undefined,
        variants: lines.length
          ? {
              create: lines.map((line) => ({
                sku: variantSku(item, line.value),
                name: line.value,
                price,
                costPrice: cost,
                attributes:
                  line.axis === "color"
                    ? { color: line.value, size: item.size }
                    : { size: line.value },
              })),
            }
          : undefined,
        productTags: {
          create: [
            { type: "size" as const, value: item.size },
            ...lines
              .filter((line) => line.axis === "color")
              .map((line) => ({ type: "color" as const, value: line.value })),
          ],
        },
      },
      include: { variants: true },
    });

    // One inventory item per variant, or a single item when the batch is
    // unsorted, then a stock_in movement carrying that line's quantity.
    if (product.variants.length) {
      const qtyByVariantSku = new Map(
        lines.map((line) => [variantSku(item, line.value), line.qty])
      );
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
    `\n${items.length} products | ${published} active+published, ${drafted} draft | ${units} units`
  );
  if (!COMMIT) console.log("Dry run only. Re-run with --commit to write.");
}

main()
  .catch((e) => {
    console.error(`\n${e.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
