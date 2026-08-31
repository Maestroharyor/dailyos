/**
 * Puts a slice of the catalog on sale, so the storefront's regular-and-sale
 * price treatment has something to render.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   bun run scripts/seed-sale-prices.ts <spaceId>                  # dry run
 *   bun run scripts/seed-sale-prices.ts <spaceId> --commit         # write
 *   bun run scripts/seed-sale-prices.ts <spaceId> --every 2        # half of them
 *   bun run scripts/seed-sale-prices.ts <spaceId> --clear          # take them off sale
 *
 * Product level only. ProductVariant carries a price but no sale concept, so a
 * variant cannot be discounted independently of its product without a schema
 * change. A product on sale discounts the product; its variants keep their own
 * prices and the storefront shows the product's sale price against them.
 *
 * This is not the same mechanism as a SaleEvent. An event discounts a set of
 * products for a window and is applied at read time; this writes
 * Product.salePrice, which is the always-on markdown a merchant sets by hand.
 * Both can be true at once, and the storefront takes whichever is lower.
 */

import { prisma } from "@/lib/db";

/**
 * Rotated by position so the catalog shows a spread rather than one discount
 * repeated. Nothing above 40%: a markdown that steep reads as a pricing error
 * rather than a sale, and this data is meant to look plausible.
 */
const DISCOUNTS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4];

/** Naira, rounded to whole units. Nobody prices a bag at 51,809.50. */
const priceAt = (base: number, discount: number) => Math.round(base * (1 - discount));

async function main() {
  const args = process.argv.slice(2);
  const [spaceId] = args.filter((a) => !a.startsWith("--"));
  const commit = args.includes("--commit");
  const clear = args.includes("--clear");
  const everyIdx = args.indexOf("--every");
  const every = everyIdx >= 0 ? Number(args[everyIdx + 1]) : 3;
  const prefixIdx = args.indexOf("--prefix");
  const prefix = prefixIdx >= 0 ? args[prefixIdx + 1] : undefined;

  if (!spaceId || !Number.isInteger(every) || every < 1) {
    console.error(
      "Usage: bun run scripts/seed-sale-prices.ts <spaceId> [--commit] [--clear] [--every N] [--prefix SKU-]"
    );
    process.exit(1);
  }

  if (clear) {
    const onSale = await prisma.product.count({ where: { spaceId, onSale: true } });
    console.log(`\n${onSale} products on sale.`);
    if (commit) {
      await prisma.product.updateMany({
        where: { spaceId, onSale: true },
        data: { onSale: false, salePrice: null },
      });
      console.log("Cleared.");
    } else {
      console.log("Dry run. Re-run with --commit to clear them.");
    }
    return;
  }

  const products = await prisma.product.findMany({
    where: { spaceId, onSale: false, ...(prefix ? { sku: { startsWith: prefix } } : {}) },
    select: { id: true, sku: true, name: true, price: true },
    orderBy: { sku: "asc" },
  });

  // Every Nth by position, so the sale products are spread through the catalog
  // instead of landing in one alphabetical clump at the top of the shop page.
  const chosen = products.filter((_, i) => i % every === 0);

  console.log(
    `\n${chosen.length} of ${products.length} products to put on sale${prefix ? ` matching ${prefix}` : ""}`
  );
  console.log(commit ? "COMMITTING\n" : "Dry run, nothing will be written.\n");

  let written = 0;

  for (const [index, product] of chosen.entries()) {
    const discount = DISCOUNTS[index % DISCOUNTS.length];
    const base = Number(product.price);
    const sale = priceAt(base, discount);

    // A markdown that does not mark anything down would render as a struck-out
    // price identical to the one beside it. Cheap products round into this.
    if (sale >= base) {
      console.log(`${product.sku.padEnd(9)} ${product.name.padEnd(30)} skipped, too cheap to mark`);
      continue;
    }

    console.log(
      `${product.sku.padEnd(9)} ${product.name.padEnd(30)} ${base.toLocaleString()} -> ${sale.toLocaleString()}  (-${Math.round(discount * 100)}%)`
    );

    written += 1;
    if (!commit) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: { salePrice: sale, onSale: true },
    });
  }

  console.log(`\n${commit ? "Put" : "Would put"} ${written} products on sale.`);
  if (!commit) console.log("Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
