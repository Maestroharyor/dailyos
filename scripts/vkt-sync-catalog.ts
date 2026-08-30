/**
 * Push name / description / slug / image alt from scripts/vkt-catalog.ts onto
 * the products already in the VKT space. Prices, variants and stock are left
 * alone — this is copy only, so it is safe to re-run after editing the catalog.
 *
 *   bun run scripts/vkt-sync-catalog.ts            # dry run
 *   bun run scripts/vkt-sync-catalog.ts --commit
 */
import { prisma } from "../src/lib/db";
import { ensureUniqueProductSlug } from "../src/lib/utils/slug";
import { ALL_ITEMS } from "./vkt-catalog";

const COMMIT = process.argv.includes("--commit");

async function main() {
  const space = await prisma.space.findFirstOrThrow({ where: { name: "VKT" } });
  console.log(`${COMMIT ? "COMMIT" : "DRY RUN"} -> ${space.name} (${space.id})\n`);

  for (const item of ALL_ITEMS) {
    const existing = await prisma.product.findUnique({
      where: { spaceId_sku: { spaceId: space.id, sku: item.sku } },
      select: { id: true, name: true, slug: true },
    });
    if (!existing) {
      console.log(`${item.sku}  SKIP (not in this space)`);
      continue;
    }

    const slug = COMMIT
      ? await ensureUniqueProductSlug(space.id, item.name, existing.id)
      : item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    console.log(
      `${item.sku}  "${existing.name}" -> "${item.name}"  slug ${existing.slug} -> ${slug}`
    );
    console.log(`        ${item.description.slice(0, 96)}...`);

    if (!COMMIT) continue;

    await prisma.product.update({
      where: { id: existing.id },
      data: { name: item.name, description: item.description, slug },
    });
    await prisma.productImage.updateMany({
      where: { productId: existing.id },
      data: { alt: item.name },
    });
  }

  if (!COMMIT) console.log("\nDry run only. Re-run with --commit to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
