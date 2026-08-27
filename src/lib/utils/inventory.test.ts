import { describe, expect, it, vi } from "vitest";
import { ensureInventoryItem } from "./inventory";

function fakeClient(existing: { id: string } | null, afterCreate: { id: string } | null = null) {
  const findFirst = vi
    .fn()
    .mockResolvedValueOnce(existing)
    .mockResolvedValue(afterCreate ?? { id: "created" });
  const createMany = vi.fn().mockResolvedValue({ count: existing ? 0 : 1 });
  return {
    client: { inventoryItem: { findFirst, createMany } } as unknown as Parameters<
      typeof ensureInventoryItem
    >[0],
    findFirst,
    createMany,
  };
}

const NON_VARIANT = {
  spaceId: "space_1",
  productId: "prod_1",
  variantId: null,
  location: "default",
};

describe("ensureInventoryItem", () => {
  it("finds the existing row for a product with no variant", () => {
    // The regression. The three callers used to upsert on the compound unique
    // with `variantId: ""`, which never matched: product creation omits the
    // field, so those rows store NULL. Every restock, stock-take adjustment and
    // purchase-order receipt therefore created a fresh inventory row, and the
    // unique index could not stop it because Postgres treats NULLs as distinct.
    const { client, findFirst, createMany } = fakeClient({ id: "existing" });

    return ensureInventoryItem(client, NON_VARIANT).then((item) => {
      expect(item.id).toBe("existing");
      expect(createMany).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledWith({
        where: NON_VARIANT,
        select: { id: true },
      });
    });
  });

  it("creates the row when there is none", async () => {
    const { client, createMany } = fakeClient(null);

    const item = await ensureInventoryItem(client, NON_VARIANT);

    expect(item.id).toBe("created");
    // skipDuplicates, so a caller that loses the race does not abort the
    // surrounding transaction; it re-reads the winner's row instead.
    expect(createMany).toHaveBeenCalledWith({ data: [NON_VARIANT], skipDuplicates: true });
  });

  it("returns the winner's row when a concurrent caller created it first", async () => {
    // createMany skipped the insert because the other transaction got there
    // first; the second findFirst is what finds its row.
    const { client } = fakeClient(null, { id: "winner" });

    const item = await ensureInventoryItem(client, NON_VARIANT);

    expect(item.id).toBe("winner");
  });

  it("keeps variants on their own row", async () => {
    const withVariant = { ...NON_VARIANT, variantId: "var_1" };
    const { client, findFirst } = fakeClient({ id: "existing" });

    await ensureInventoryItem(client, withVariant);

    expect(findFirst).toHaveBeenCalledWith({ where: withVariant, select: { id: true } });
  });
});
