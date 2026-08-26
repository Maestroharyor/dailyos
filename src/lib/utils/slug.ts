import { prisma } from "@/lib/db";

/**
 * Normalize a string into a URL slug: lowercase, ASCII alphanumerics + hyphens.
 * Mirrors the duplicate of this function in src/app/commerce/sales/new/page.tsx —
 * import from here in new call sites.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Return a slug that is unique within the given Space. If the base slug is
 * already taken, append `-1`, `-2`, ... until a free slot is found. After 8
 * attempts, fall back to a base36 timestamp suffix to guarantee progress.
 *
 * Pass `ignoreId` when updating an existing product so the product doesn't
 * collide with itself.
 */
export async function ensureUniqueProductSlug(
  spaceId: string,
  base: string,
  ignoreId?: string
): Promise<string> {
  const normalized = slugify(base) || "item";
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? normalized : `${normalized}-${i}`;
    const existing = await prisma.product.findFirst({
      where: {
        spaceId,
        slug: candidate,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${normalized}-${Date.now().toString(36)}`;
}
