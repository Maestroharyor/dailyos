/**
 * Seeds published bag products into a space, with images and opening stock.
 *
 * Dry run by default — prints exactly what it would write and touches nothing.
 * Pass --commit to write. Idempotent: any SKU that already exists in the space
 * is skipped, so a partial run can be re-run safely.
 *
 *   bun run scripts/seed-vkt-products.ts <spaceId>            # dry run
 *   bun run scripts/seed-vkt-products.ts <spaceId> --commit   # write
 */

import { prisma } from "@/lib/db";

// Every id below was checked to return HTTP 200 from images.unsplash.com before
// being committed here. One dead id was already shipped in the VKT fixture
// (an invalid hex character in the id), which is why these are verified rather
// than assumed.
const IMAGES = [
  "photo-1590874103328-eac38a683ce7",
  "photo-1590739225287-bd31519780c3",
  "photo-1548036328-c9fa89d128fa",
  "photo-1584917865442-de89df76afd3",
  "photo-1544816155-12df9643f363",
  "photo-1566150902887-9679ecc155ba",
  "photo-1575032617751-6ddec2089882",
  "photo-1581605405669-fcdf81165afa",
  "photo-1553062407-98eeb64c6a62",
  "photo-1566150905458-1bf1fc113f0d",
  "photo-1591561954557-26941169b49e",
  "photo-1594633313593-bab3825d0caf",
];

const imageUrl = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

// `singular` is spelled out rather than derived: stripping a trailing "s" turns
// "Clutches" into "Clutche", and every rule that fixes that breaks something
// else. Five categories do not need an inflector.
const CATEGORIES = [
  { name: "Tote Bags", slug: "tote-bags", singular: "Tote" },
  { name: "Crossbody Bags", slug: "crossbody-bags", singular: "Crossbody Bag" },
  { name: "Shoulder Bags", slug: "shoulder-bags", singular: "Shoulder Bag" },
  { name: "Clutches", slug: "clutches", singular: "Clutch" },
  { name: "Backpacks", slug: "backpacks", singular: "Backpack" },
];

const MATERIALS = ["Leather", "Suede", "Canvas", "Woven", "Patent", "Nylon"];
const STYLES = ["Classic", "Structured", "Slouchy", "Quilted", "Mini", "Oversized"];

interface Seed {
  sku: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  categorySlug: string;
  image: string;
  stock: number;
}

/**
 * Deterministic on index: same run produces the same catalogue, so a re-run
 * after a partial failure lines up with what already landed. Prices are NGN and
 * sit either side of a ₦70,000 free-shipping threshold on purpose, so the
 * waiver is actually exercisable from the storefront.
 */
function buildSeeds(count: number, startAt: number): Seed[] {
  const seeds: Seed[] = [];
  for (let i = 0; i < count; i++) {
    const n = startAt + i;
    const category = CATEGORIES[i % CATEGORIES.length];
    const material = MATERIALS[i % MATERIALS.length];
    const style = STYLES[(i * 3) % STYLES.length];
    const name = `${style} ${material} ${category.singular}`;
    const price = 18_500 + ((i * 4_300) % 92_000);
    seeds.push({
      sku: `VKT-${String(n).padStart(3, "0")}`,
      slug: `${style}-${material}-${category.singular}-${n}`.toLowerCase().replace(/\s+/g, "-"),
      name,
      description: `${name} in a ${material.toLowerCase()} finish. Roomy enough for the everyday carry, structured enough for the office.`,
      price,
      costPrice: Math.round(price * 0.55),
      categorySlug: category.slug,
      image: imageUrl(IMAGES[i % IMAGES.length]),
      stock: 5 + ((i * 7) % 40),
    });
  }
  return seeds;
}

async function main() {
  const [spaceId, ...flags] = process.argv.slice(2);
  const commit = flags.includes("--commit");
  const count = Number(flags.find((f) => f.startsWith("--count="))?.split("=")[1] ?? 50);

  if (!spaceId) {
    console.error("Usage: bun run scripts/seed-vkt-products.ts <spaceId> [--commit] [--count=50]");
    process.exit(1);
  }

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, name: true },
  });
  if (!space) {
    console.error(`No space with id ${spaceId}`);
    process.exit(1);
  }

  const existingCount = await prisma.product.count({ where: { spaceId } });
  const seeds = buildSeeds(count, existingCount + 1);

  const takenSkus = new Set(
    (
      await prisma.product.findMany({
        where: { spaceId, sku: { in: seeds.map((s) => s.sku) } },
        select: { sku: true },
      })
    ).map((p) => p.sku)
  );
  const todo = seeds.filter((s) => !takenSkus.has(s.sku));

  console.log(`Space:     ${space.name} (${space.id})`);
  console.log(`Existing:  ${existingCount} products`);
  console.log(`To create: ${todo.length} (${takenSkus.size} SKUs already present, skipped)`);
  console.log(`Mode:      ${commit ? "COMMIT" : "DRY RUN — nothing will be written"}`);
  console.log("");
  for (const s of todo.slice(0, 5)) {
    console.log(`  ${s.sku}  ${s.name}  ₦${s.price.toLocaleString()}  stock ${s.stock}`);
  }
  if (todo.length > 5) console.log(`  … and ${todo.length - 5} more`);

  if (!commit) {
    console.log("\nDry run complete. Re-run with --commit to write.");
    return;
  }

  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { spaceId, slug: c.slug },
      select: { id: true },
    });
    const row =
      existing ?? (await prisma.category.create({ data: { spaceId, name: c.name, slug: c.slug } }));
    categoryIds.set(c.slug, row.id);
  }

  let created = 0;
  for (const s of todo) {
    // One transaction per product: a failure halfway through leaves whole
    // products behind rather than a product with no image or no stock.
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          spaceId,
          categoryId: categoryIds.get(s.categorySlug),
          sku: s.sku,
          slug: s.slug,
          name: s.name,
          description: s.description,
          price: s.price,
          costPrice: s.costPrice,
          status: "active",
          isPublished: true,
          tags: ["bags", s.categorySlug],
        },
      });
      await tx.productImage.create({
        data: { productId: product.id, url: s.image, alt: s.name, isPrimary: true },
      });
      // Stock is derived from movements, never stored as a column, so opening
      // stock has to be a stock_in movement on an inventory item.
      const item = await tx.inventoryItem.create({
        data: { spaceId, productId: product.id, location: "default" },
      });
      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: item.id,
          type: "stock_in",
          quantity: s.stock,
          notes: "Opening stock (seed)",
          costAtTime: s.costPrice,
        },
      });
    });
    created++;
  }

  console.log(`\nCreated ${created} products.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
