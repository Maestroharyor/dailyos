/**
 * Gives each colour variant its own photograph, so choosing a colour on the
 * storefront changes the picture.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   bun run scripts/seed-variant-images.ts <spaceId>            # dry run
 *   bun run scripts/seed-variant-images.ts <spaceId> --commit   # write
 *
 * Only colour variants get images. A size variant is the same object
 * photographed the same way, so tagging one would make the gallery flicker
 * between identical pictures for no reason.
 *
 * Deliberately leaves one colour variant per product untagged. The storefront
 * falls back to the shared product images when a variant has none of its own,
 * and that fallback is the path a real half-photographed catalog takes, so it
 * needs a fixture as much as the happy path does.
 *
 * Every id below was checked to return HTTP 200 from images.unsplash.com.
 */

import { toAttributeRecord } from "@/lib/commerce/variant-attributes";
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

const imageUrl = (id: string) =>
  `https://images.unsplash.com/${id}?w=800&q=80&auto=format&fit=crop`;

async function main() {
  const [spaceId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const commit = process.argv.includes("--commit");

  if (!spaceId) {
    console.error("Usage: bun run scripts/seed-variant-images.ts <spaceId> [--commit]");
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { spaceId, variants: { some: {} } },
    select: {
      id: true,
      sku: true,
      name: true,
      variants: { select: { id: true, sku: true, name: true, attributes: true } },
      images: { select: { id: true, variantId: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sku: "asc" },
  });

  console.log(commit ? "\nCOMMITTING\n" : "\nDry run, nothing will be written.\n");

  let added = 0;
  let offset = 0;

  for (const p of products) {
    const colourVariants = p.variants.filter((v) => {
      const attrs = toAttributeRecord(v.attributes);
      return typeof attrs.color === "string" && attrs.color.length > 0;
    });
    if (colourVariants.length === 0) continue;

    const alreadyTagged = new Set(p.images.map((i) => i.variantId).filter(Boolean));

    // All but the last, so one colour always exercises the fallback.
    const targets = colourVariants.slice(0, -1).filter((v) => !alreadyTagged.has(v.id));

    if (targets.length === 0) continue;

    const sharedCount = p.images.filter((i) => !i.variantId).length;
    console.log(`${p.sku.padEnd(9)} ${p.name}`);
    console.log(
      `  ${sharedCount} shared images, ${colourVariants.length} colours, tagging ${targets.length} (last colour falls back on purpose)`
    );

    const nextOrder = p.images.length;
    let i = 0;
    for (const v of targets) {
      const url = imageUrl(IMAGES[(offset + i) % IMAGES.length]);
      console.log(`    ${v.sku.padEnd(20)} ${v.name.padEnd(16)} -> ${url.slice(30, 62)}`);
      if (commit) {
        await prisma.productImage.create({
          data: {
            productId: p.id,
            variantId: v.id,
            url,
            alt: `${p.name}, ${v.name}`,
            // Never isPrimary: that flag drives the card and the listing, which
            // must keep showing the product rather than one of its colours.
            isPrimary: false,
            sortOrder: nextOrder + i,
          },
        });
      }
      added++;
      i++;
    }
    offset += targets.length;
  }

  console.log(`\n${commit ? "Added" : "Would add"} ${added} variant images.`);
  if (!commit) console.log("Re-run with --commit to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
