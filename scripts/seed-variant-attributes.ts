/**
 * Gives existing products colour and size variants, for testing the variant
 * picker end to end.
 *
 * Dry run by default — prints every variant it would write and touches nothing.
 * Pass --commit to write. Idempotent: a product that already has variants is
 * skipped whole, so a partial run can be re-run safely.
 *
 *   bun run scripts/seed-variant-attributes.ts <spaceId>            # dry run
 *   bun run scripts/seed-variant-attributes.ts <spaceId> --commit   # write
 *
 * Attribute keys are written already normalized (lowercase, trimmed) to match
 * normalizeAttributeKey. The storefront groups options by key, so "Color" and
 * "color" on two variants of one product would render as two pickers.
 *
 * Colour VALUES are deliberately mixed. Most are CSS-renderable so the
 * storefront draws swatches; one product uses catalog-style names ("Cognac",
 * "Wine") that CSS cannot paint, so it exercises the all-or-nothing fallback
 * to text pills in showsColorSwatches. Both paths need a fixture.
 */

import { prisma } from "@/lib/db";

interface VariantSeed {
  suffix: string;
  name: string;
  attributes: Record<string, string>;
  /** Multiplier on the product's base price. 1 means "same as the product". */
  priceFactor: number;
  stock: number;
}

interface ProductSeed {
  sku: string;
  /** What this fixture is for, printed in the dry run. */
  purpose: string;
  variants: VariantSeed[];
}

const colour = (value: string, factor = 1, stock = 6): VariantSeed => ({
  suffix: value.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
  name: value,
  attributes: { color: value },
  priceFactor: factor,
  stock,
});

const PRODUCTS: ProductSeed[] = [
  {
    sku: "VKT-037",
    purpose: "colour only, all CSS-renderable, one price",
    variants: [colour("Black"), colour("Tan"), colour("Olive"), colour("Navy")],
  },
  {
    sku: "VKT-058",
    purpose: "size only, one price",
    variants: [
      { suffix: "SM", name: "Small", attributes: { size: "Small" }, priceFactor: 1, stock: 5 },
      { suffix: "MD", name: "Medium", attributes: { size: "Medium" }, priceFactor: 1, stock: 8 },
      { suffix: "LG", name: "Large", attributes: { size: "Large" }, priceFactor: 1, stock: 4 },
    ],
  },
  {
    sku: "VKT-036",
    purpose: "colour x size matrix, one price",
    variants: (["Black", "Beige"] as const).flatMap((c) =>
      (["Small", "Large"] as const).map((s) => ({
        suffix: `${c.slice(0, 3).toUpperCase()}-${s.slice(0, 2).toUpperCase()}`,
        name: `${c} / ${s}`,
        attributes: { color: c, size: s },
        priceFactor: 1,
        stock: 4,
      }))
    ),
  },
  {
    sku: "VKT-035",
    purpose: "size changes the price (small cheaper, large dearer)",
    variants: [
      { suffix: "SM", name: "Small", attributes: { size: "Small" }, priceFactor: 0.85, stock: 6 },
      { suffix: "MD", name: "Medium", attributes: { size: "Medium" }, priceFactor: 1, stock: 6 },
      { suffix: "LG", name: "Large", attributes: { size: "Large" }, priceFactor: 1.2, stock: 3 },
    ],
  },
  {
    sku: "VKT-034",
    purpose: "colour changes the price (exotic leathers cost more)",
    variants: [colour("Black", 1, 7), colour("Chocolate", 1.1, 5), colour("Crimson", 1.35, 2)],
  },
  {
    sku: "VKT-033",
    purpose: "colour x size, BOTH change the price",
    variants: (
      [
        ["Black", 1],
        ["Tan", 1.08],
      ] as const
    ).flatMap(([c, cf]) =>
      (
        [
          ["Small", 0.9],
          ["Large", 1.25],
        ] as const
      ).map(([s, sf]) => ({
        suffix: `${c.slice(0, 3).toUpperCase()}-${s.slice(0, 2).toUpperCase()}`,
        name: `${c} / ${s}`,
        attributes: { color: c, size: s },
        priceFactor: cf * sf,
        stock: 3,
      }))
    ),
  },
  {
    sku: "VKT-032",
    purpose: "catalog colour names CSS cannot paint - must fall back to pills",
    variants: [colour("Cognac"), colour("Wine"), colour("Natural")],
  },
  {
    sku: "VKT-055",
    purpose: "one variant out of stock, to check the picker disables it",
    variants: [colour("Black", 1, 5), colour("Ivory", 1, 0), colour("Teal", 1, 4)],
  },
];

/** Naira, rounded to whole units. Nobody prices a bag at 51,809.50. */
function priceAt(base: number, factor: number): number {
  return Math.round(base * factor);
}

async function main() {
  const [spaceId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const commit = process.argv.includes("--commit");

  if (!spaceId) {
    console.error("Usage: bun run scripts/seed-variant-attributes.ts <spaceId> [--commit]");
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

  console.log(`\n=== ${space.name} [${space.id}] ===`);
  console.log(commit ? "COMMITTING\n" : "Dry run, nothing will be written.\n");

  let planned = 0;
  let written = 0;
  let skipped = 0;

  for (const seed of PRODUCTS) {
    const product = await prisma.product.findFirst({
      where: { spaceId, sku: seed.sku },
      select: {
        id: true,
        name: true,
        price: true,
        costPrice: true,
        _count: { select: { variants: true } },
      },
    });

    if (!product) {
      console.log(`SKIP ${seed.sku} - no such product in this space`);
      skipped++;
      continue;
    }
    if (product._count.variants > 0) {
      console.log(
        `SKIP ${seed.sku} ${product.name} - already has ${product._count.variants} variants`
      );
      skipped++;
      continue;
    }

    const base = Number(product.price);
    const baseCost = Number(product.costPrice);

    console.log(`\n${seed.sku}  ${product.name}`);
    console.log(`  base ${base.toLocaleString()} - ${seed.purpose}`);
    for (const v of seed.variants) {
      const price = priceAt(base, v.priceFactor);
      const delta =
        price === base ? "" : ` (${price > base ? "+" : ""}${(price - base).toLocaleString()})`;
      console.log(
        `    ${seed.sku}-${v.suffix}  ${v.name.padEnd(18)} ${price.toLocaleString().padStart(9)}${delta}  stock ${v.stock}`
      );
      planned++;
    }

    if (!commit) continue;

    // One transaction per product: a failure halfway leaves the product with
    // no variants rather than half a picker, which the storefront would render
    // as a real but incomplete option group.
    await prisma.$transaction(async (tx) => {
      for (const v of seed.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: `${seed.sku}-${v.suffix}`,
            name: v.name,
            price: priceAt(base, v.priceFactor),
            costPrice: Math.round(baseCost * v.priceFactor),
            attributes: v.attributes,
          },
        });
        // Stock is derived from movements, never stored as a column, so opening
        // stock is a stock_in on a per-variant inventory item. A zero-stock
        // variant still gets the item, so it reads as "0" rather than "unknown".
        const item = await tx.inventoryItem.create({
          data: { spaceId, productId: product.id, variantId: variant.id, location: "default" },
        });
        if (v.stock > 0) {
          await tx.inventoryMovement.create({
            data: {
              inventoryItemId: item.id,
              type: "stock_in",
              quantity: v.stock,
              notes: "Opening stock (variant seed)",
              costAtTime: Math.round(baseCost * v.priceFactor),
            },
          });
        }
        written++;
      }
    });
  }

  console.log(
    `\n${commit ? "Wrote" : "Would write"} ${commit ? written : planned} variants across ${PRODUCTS.length - skipped} products. ${skipped} skipped.`
  );
  if (!commit) console.log("Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
