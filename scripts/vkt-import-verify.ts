// Read-only verification of the VKT catalog import.
import { prisma } from "../src/lib/db";
import { getStockByInventoryItems } from "../src/lib/utils/inventory";
import { CATALOG, totalUnits } from "./vkt-catalog";

async function main() {
  const space = await prisma.space.findFirstOrThrow({ where: { name: "VKT" } });
  const products = await prisma.product.findMany({
    where: { spaceId: space.id },
    include: {
      images: true, variants: true, productTags: true, category: true,
      inventoryItems: { select: { id: true, variantId: true } },
    },
    orderBy: { sku: "asc" },
  });

  const stock = await getStockByInventoryItems(
    products.flatMap((p) => p.inventoryItems.map((i) => i.id))
  );

  let bad = 0;
  const urls: string[] = [];
  for (const p of products) {
    const actual = p.inventoryItems.reduce((s, i) => s + (stock.get(i.id) ?? 0), 0);
    const expected = totalUnits(CATALOG.find((c) => c.sku === p.sku)!);
    const ok = actual === expected;
    if (!ok) bad++;
    p.images.forEach((i) => urls.push(i.url));
    console.log(
      `${p.sku} ${ok ? "OK " : "BAD"} stock=${actual}/${expected} ` +
        `variants=${p.variants.length} invItems=${p.inventoryItems.length} ` +
        `imgs=${p.images.length} tags=${p.productTags.length} cat=${p.category?.name} ` +
        `${p.status}/${p.isPublished ? "published" : "unpublished"} ` +
        `price=${p.price} sale=${p.salePrice ?? "-"} onSale=${p.onSale} slug=${p.slug}`
    );
  }
  console.log(`\n${products.length} products, ${bad} stock mismatches`);

  const storefrontVisible = await prisma.product.count({
    where: { spaceId: space.id, status: "active", isPublished: true },
  });
  console.log(`storefront-visible (active+published): ${storefrontVisible}`);
  console.log("\nimage URLs:");
  urls.forEach((u) => console.log("  " + u));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
