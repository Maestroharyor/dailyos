/**
 * Gives products a multi-image gallery, so the PDP thumbnail strip and the
 * lightbox have something to show.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   bun run scripts/seed-product-images.ts <spaceId>            # dry run
 *   bun run scripts/seed-product-images.ts <spaceId> --commit   # write
 *   bun run scripts/seed-product-images.ts <spaceId> --only-variants
 *
 * Products in this space were seeded with exactly one image each, so the
 * gallery code on the storefront has never had a second thumbnail to render.
 * This tops each product up to IMAGES_PER_PRODUCT without touching the image
 * that is already there: the existing row keeps isPrimary and sortOrder 0, so
 * the card and the listing keep showing the same picture they do now.
 *
 * Every id below was checked to return HTTP 200 from images.unsplash.com.
 */

import { prisma } from "@/lib/db";

const IMAGES = [
  "photo-1584917865442-de89df76afd3",
  "photo-1548036328-c9fa89d128fa",
  "photo-1590874103328-eac38a683ce7",
  "photo-1566150902887-9679ecc155ba",
  "photo-1553062407-98eeb64c6a62",
  "photo-1594633313593-bab3825d0caf",
  "photo-1591561954557-26941169b49e",
  "photo-1575032617751-6ddec2089882",
];

const IMAGES_PER_PRODUCT = 4;

const imageUrl = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

/**
 * Picks images for a product from a stable offset, so two products sitting
 * next to each other in a listing do not show the same four pictures in the
 * same order. Deterministic on the id, so a re-run picks the same ones.
 */
function pickFor(productId: string, count: number): string[] {
  let hash = 0;
  for (const ch of productId) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return Array.from({ length: count }, (_, i) => IMAGES[(hash + i) % IMAGES.length]);
}

async function main() {
  const [spaceId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const commit = process.argv.includes("--commit");
  const onlyVariants = process.argv.includes("--only-variants");

  if (!spaceId) {
    console.error(
      "Usage: bun run scripts/seed-product-images.ts <spaceId> [--commit] [--only-variants]"
    );
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: {
      spaceId,
      ...(onlyVariants ? { variants: { some: {} } } : {}),
    },
    select: {
      id: true,
      sku: true,
      name: true,
      images: { select: { id: true, url: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { variants: true } },
    },
    orderBy: { sku: "asc" },
  });

  console.log(`\n${products.length} products${onlyVariants ? " with variants" : ""} in ${spaceId}`);
  console.log(commit ? "COMMITTING\n" : "Dry run, nothing will be written.\n");

  let added = 0;
  let skipped = 0;

  for (const p of products) {
    if (p.images.length >= IMAGES_PER_PRODUCT) {
      skipped++;
      continue;
    }

    const existing = new Set(p.images.map((i) => i.url));
    const wanted = pickFor(p.id, IMAGES.length)
      .map(imageUrl)
      .filter((u) => !existing.has(u))
      .slice(0, IMAGES_PER_PRODUCT - p.images.length);

    if (wanted.length === 0) {
      skipped++;
      continue;
    }

    console.log(
      `${p.sku.padEnd(9)} ${p.name.padEnd(32)} ${p.images.length} -> ${p.images.length + wanted.length} images${p._count.variants ? `  (${p._count.variants} variants)` : ""}`
    );

    if (!commit) {
      added += wanted.length;
      continue;
    }

    // sortOrder continues from the highest existing one rather than from the
    // count, so a product whose images were reordered by hand does not get a
    // duplicate sortOrder and an arbitrary tie-break in the gallery.
    const nextOrder = p.images.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;

    await prisma.productImage.createMany({
      data: wanted.map((url, i) => ({
        productId: p.id,
        url,
        alt: `${p.name}, view ${p.images.length + i + 1}`,
        // Never isPrimary: the product already has one, and two primaries
        // makes which-image-shows-on-the-card a coin flip.
        isPrimary: false,
        sortOrder: nextOrder + i,
      })),
    });
    added += wanted.length;
  }

  console.log(
    `\n${commit ? "Added" : "Would add"} ${added} images. ${skipped} products already had ${IMAGES_PER_PRODUCT}+.`
  );
  if (!commit) console.log("Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
