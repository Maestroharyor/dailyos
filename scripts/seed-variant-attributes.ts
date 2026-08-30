/**
 * Gives products colour and size variants, for exercising the variant picker.
 *
 * Dry run by default. Pass --commit to write. Idempotent: a product that
 * already has variants is skipped whole, so a partial run can be re-run.
 *
 *   bun run scripts/seed-variant-attributes.ts <spaceId>                  # dry run
 *   bun run scripts/seed-variant-attributes.ts <spaceId> --commit         # write
 *   bun run scripts/seed-variant-attributes.ts <spaceId> --prefix VKT-    # narrow
 *
 * Shapes are assigned round-robin by position, so the catalog ends up with a
 * spread rather than thirty products all shaped the same way. Every shape below
 * exists to make one behaviour visible on the storefront, including the ones
 * that are supposed to look unremarkable.
 *
 * Attribute keys are written already normalized (lowercase, trimmed) to match
 * normalizeAttributeKey. The storefront groups options by key, so "Color" and
 * "color" on two variants of one product would render as two separate pickers.
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

interface Shape {
  label: string;
  build: () => VariantSeed[];
}

const colour = (value: string, factor = 1, stock = 6): VariantSeed => ({
  suffix: value.toUpperCase().replace(/[^A-Z0-9]+/g, "-"),
  name: value,
  attributes: { color: value },
  priceFactor: factor,
  stock,
});

const size = (value: string, factor = 1, stock = 6): VariantSeed => ({
  suffix: value.slice(0, 2).toUpperCase(),
  name: value,
  attributes: { size: value },
  priceFactor: factor,
  stock,
});

function matrix(
  colours: readonly (readonly [string, number])[],
  sizes: readonly (readonly [string, number])[]
): VariantSeed[] {
  return colours.flatMap(([c, cf]) =>
    sizes.map(([s, sf]) => ({
      suffix: `${c.slice(0, 3).toUpperCase()}-${s.slice(0, 2).toUpperCase()}`,
      name: `${c} / ${s}`,
      attributes: { color: c, size: s },
      priceFactor: cf * sf,
      stock: 4,
    }))
  );
}

const SHAPES: Shape[] = [
  {
    label: "colour only, one price",
    build: () => [colour("Black"), colour("Tan"), colour("Olive"), colour("Navy")],
  },
  {
    label: "size only, one price",
    build: () => [size("Small", 1, 5), size("Medium", 1, 8), size("Large", 1, 4)],
  },
  {
    label: "colour changes the price",
    build: () => [colour("Black", 1, 7), colour("Chocolate", 1.1, 5), colour("Crimson", 1.35, 2)],
  },
  {
    label: "size changes the price",
    build: () => [size("Small", 0.85, 6), size("Medium", 1, 6), size("Large", 1.2, 3)],
  },
  {
    label: "colour x size, one price",
    build: () =>
      matrix(
        [
          ["Black", 1],
          ["Beige", 1],
        ],
        [
          ["Small", 1],
          ["Large", 1],
        ]
      ),
  },
  {
    label: "colour x size, both change the price",
    build: () =>
      matrix(
        [
          ["Black", 1],
          ["Tan", 1.08],
        ],
        [
          ["Small", 0.9],
          ["Large", 1.25],
        ]
      ),
  },
  {
    // CSS cannot paint these, so showsColorSwatches must fall the whole group
    // back to text pills rather than draw invisible circles.
    label: "catalog colour names, must fall back to pills",
    build: () => [colour("Cognac"), colour("Wine"), colour("Natural")],
  },
  {
    label: "one colour out of stock",
    build: () => [colour("Black", 1, 5), colour("Ivory", 1, 0), colour("Teal", 1, 4)],
  },
];

/** Naira, rounded to whole units. Nobody prices a bag at 51,809.50. */
const priceAt = (base: number, factor: number) => Math.round(base * factor);

async function main() {
  const args = process.argv.slice(2);
  const [spaceId] = args.filter((a) => !a.startsWith("--"));
  const commit = args.includes("--commit");
  const prefixIdx = args.indexOf("--prefix");
  const prefix = prefixIdx >= 0 ? args[prefixIdx + 1] : undefined;

  if (!spaceId) {
    console.error(
      "Usage: bun run scripts/seed-variant-attributes.ts <spaceId> [--commit] [--prefix SKU-]"
    );
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: {
      spaceId,
      variants: { none: {} },
      ...(prefix ? { sku: { startsWith: prefix } } : {}),
    },
    select: { id: true, sku: true, name: true, price: true, costPrice: true },
    orderBy: { sku: "asc" },
  });

  console.log(
    `\n${products.length} products without variants${prefix ? ` matching ${prefix}` : ""}`
  );
  console.log(commit ? "COMMITTING\n" : "Dry run, nothing will be written.\n");

  let written = 0;

  for (const [index, product] of products.entries()) {
    const shape = SHAPES[index % SHAPES.length];
    const variants = shape.build();
    const base = Number(product.price);
    const baseCost = Number(product.costPrice);

    const prices = new Set(variants.map((v) => priceAt(base, v.priceFactor)));
    console.log(
      `${product.sku.padEnd(9)} ${product.name.padEnd(30)} ${variants.length} variants, ${prices.size === 1 ? "one price" : `${prices.size} prices`}  [${shape.label}]`
    );

    written += variants.length;
    if (!commit) continue;

    // One transaction per product: a failure halfway leaves the product with no
    // variants rather than half a picker, which the storefront would render as
    // a real but incomplete option group.
    await prisma.$transaction(async (tx) => {
      for (const v of variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: `${product.sku}-${v.suffix}`,
            name: v.name,
            price: priceAt(base, v.priceFactor),
            costPrice: Math.round(baseCost * v.priceFactor),
            attributes: v.attributes,
          },
        });
        // Stock is derived from movements, never stored as a column. A
        // zero-stock variant still gets an inventory item, so it reads as "0"
        // rather than as unknown.
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
      }
    });
  }

  console.log(
    `\n${commit ? "Wrote" : "Would write"} ${written} variants across ${products.length} products.`
  );
  if (!commit) console.log("Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
