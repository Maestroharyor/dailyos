import { describe, expect, it, vi } from "vitest";
import { ensureInventoryItem } from "./inventory";

function fakeClient(existing: { id: string } | null) {
  const findFirst = vi.fn().mockResolvedValue(existing);
  const create = vi.fn().mockResolvedValue({ id: "created" });
  return {
    client: { inventoryItem: { findFirst, create } } as unknown as Parameters<
      typeof ensureInventoryItem
    >[0],
    findFirst,
    create,
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
    const { client, findFirst, create } = fakeClient({ id: "existing" });

    return ensureInventoryItem(client, NON_VARIANT).then((item) => {
      expect(item.id).toBe("existing");
      expect(create).not.toHaveBeenCalled();
      expect(findFirst).toHaveBeenCalledWith({
        where: NON_VARIANT,
        select: { id: true },
      });
    });
  });

  it("creates the row when there is none", async () => {
    const { client, create } = fakeClient(null);

    const item = await ensureInventoryItem(client, NON_VARIANT);

    expect(item.id).toBe("created");
    expect(create).toHaveBeenCalledWith({ data: NON_VARIANT, select: { id: true } });
  });

  it("keeps variants on their own row", async () => {
    const withVariant = { ...NON_VARIANT, variantId: "var_1" };
    const { client, findFirst } = fakeClient({ id: "existing" });

    await ensureInventoryItem(client, withVariant);

    expect(findFirst).toHaveBeenCalledWith({ where: withVariant, select: { id: true } });
  });
});
