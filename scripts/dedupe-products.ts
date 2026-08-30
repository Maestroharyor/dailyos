/**
 * Removes duplicate products from a space, keeping one copy of each name.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   bun run scripts/dedupe-products.ts <spaceId>            # dry run
 *   bun run scripts/dedupe-products.ts <spaceId> --commit   # delete
 *
 * VKT Test was seeded twice, so most product names exist on two SKUs with
 * different prices. That is not only untidy: a shopper following a link or a
 * search result lands on whichever copy the query happened to return, which is
 * why a product looked like it had no variants when its twin did.
 *
 * Which copy survives, in order:
 *
 *   1. The one with order history. order_items is ON DELETE RESTRICT, so the
 *      database would refuse anyway; this makes the choice deliberate instead
 *      of an error, and it means a past order keeps pointing at a real row.
 *   2. The one with variants, since that is the richer record.
 *   3. The lowest SKU, so a re-run makes the same choice.
 *
 * What deleting takes with it, all ON DELETE CASCADE: images, variants,
 * inventory items and their movements, product tags, supplier links, sale
 * event membership, stock conflicts, and wishlist entries. Purchase order,
 * return and stock take lines are ON DELETE SET NULL, so those survive
 * pointing at nothing.
 *
 * Wishlist is the one worth naming out loud, because it is somebody's saved
 * item disappearing rather than catalog data, and it is reported separately
 * for that reason. Supplier links and sale event membership are catalog wiring
 * a merchant set up by hand, so they are cheap to lose but not free.
 */

import { prisma } from "@/lib/db";

interface Candidate {
  id: string;
  sku: string;
  name: string;
  orderItems: number;
  wishlist: number;
  variants: number;
  images: number;
}

/** Lower sorts first, so the winner is the head of the sorted list. */
function rank(a: Candidate, b: Candidate): number {
  if (a.orderItems !== b.orderItems) return b.orderItems - a.orderItems;
  if (a.variants !== b.variants) return b.variants - a.variants;
  return a.sku.localeCompare(b.sku);
}

async function main() {
  const [spaceId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const commit = process.argv.includes("--commit");

  if (!spaceId) {
    console.error("Usage: bun run scripts/dedupe-products.ts <spaceId> [--commit]");
    process.exit(1);
  }

  const rows = await prisma.product.findMany({
    where: { spaceId },
    select: {
      id: true,
      sku: true,
      name: true,
      _count: {
        select: { orderItems: true, wishlistItems: true, variants: true, images: true },
      },
    },
    orderBy: { sku: "asc" },
  });

  const byName = new Map<string, Candidate[]>();
  for (const r of rows) {
    const c: Candidate = {
      id: r.id,
      sku: r.sku,
      name: r.name,
      orderItems: r._count.orderItems,
      wishlist: r._count.wishlistItems,
      variants: r._count.variants,
      images: r._count.images,
    };
    const list = byName.get(r.name);
    if (list) list.push(c);
    else byName.set(r.name, [c]);
  }

  const doomed: Candidate[] = [];
  let groups = 0;

  console.log(`\n${rows.length} products, ${byName.size} distinct names`);
  console.log(commit ? "COMMITTING\n" : "Dry run, nothing will be deleted.\n");

  for (const [name, list] of [...byName.entries()].sort()) {
    if (list.length < 2) continue;
    groups++;
    const [keep, ...drop] = [...list].sort(rank);
    const why =
      keep.orderItems > 0 ? "has orders" : keep.variants > 0 ? "has variants" : "lowest SKU";
    console.log(`${name}`);
    console.log(
      `  KEEP   ${keep.sku}  (${why}; ${keep.variants} variants, ${keep.images} images, ${keep.orderItems} order items)`
    );
    for (const d of drop) {
      const losses = [
        d.variants ? `${d.variants} variants` : null,
        d.images ? `${d.images} images` : null,
        d.wishlist ? `${d.wishlist} WISHLIST ENTRIES` : null,
      ].filter(Boolean);
      console.log(
        `  DELETE ${d.sku}  ${losses.length ? `takes ${losses.join(", ")}` : "nothing attached"}`
      );
      doomed.push(d);
    }
  }

  // Belt and braces on top of the RESTRICT constraint: refuse rather than let
  // the database raise halfway through and leave the space half deduped.
  const unsafe = doomed.filter((d) => d.orderItems > 0);
  if (unsafe.length > 0) {
    console.error(`\nRefusing: ${unsafe.map((u) => u.sku).join(", ")} carry order history.`);
    process.exit(1);
  }

  console.log(
    `\n${commit ? "Deleting" : "Would delete"} ${doomed.length} products across ${groups} duplicated names.`
  );
  const wishlistLoss = doomed.reduce((n, d) => n + d.wishlist, 0);
  if (wishlistLoss > 0) {
    console.log(`This removes ${wishlistLoss} wishlist entries, which are somebody's saved items.`);
  }

  if (!commit) {
    console.log("Re-run with --commit to apply.");
    return;
  }

  // One transaction: a space that is half deduped is worse than one that is
  // not deduped, because the duplicates left behind are no longer predictable.
  await prisma.$transaction(doomed.map((d) => prisma.product.delete({ where: { id: d.id } })));
  console.log(`Deleted ${doomed.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
