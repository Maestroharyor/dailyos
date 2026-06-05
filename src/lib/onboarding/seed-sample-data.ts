import { prisma } from "@/lib/db";

/**
 * Seeds a small set of sample commerce data so a brand-new space isn't a blank
 * slate after onboarding. Idempotent-ish: skips if the space already has any
 * products. Best-effort — callers should not fail onboarding if this throws.
 */
export async function seedSampleData(spaceId: string): Promise<void> {
  const existing = await prisma.product.count({ where: { spaceId } });
  if (existing > 0) return;

  const category = await prisma.category.create({
    data: {
      spaceId,
      name: "Sample Collection",
      slug: `sample-collection-${Date.now().toString(36)}`,
      description: "Example category created during onboarding. Safe to delete.",
    },
  });

  const samples = [
    { name: "Sample T-Shirt", sku: "SAMPLE-TSHIRT", price: 25, costPrice: 12 },
    { name: "Sample Mug", sku: "SAMPLE-MUG", price: 12, costPrice: 5 },
    { name: "Sample Tote Bag", sku: "SAMPLE-TOTE", price: 18, costPrice: 8 },
  ];

  for (const s of samples) {
    await prisma.product.create({
      data: {
        spaceId,
        categoryId: category.id,
        sku: s.sku,
        slug: s.sku.toLowerCase(),
        name: s.name,
        description: "Sample product created during onboarding. Safe to delete.",
        price: s.price,
        costPrice: s.costPrice,
        isPublished: false,
      },
    });
  }
}
