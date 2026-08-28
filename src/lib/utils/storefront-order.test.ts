import { describe, expect, it } from "vitest";
import { resolveItemImage, serializeStorefrontOrder } from "./storefront-order";

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    orderNumber: "SF-20260828-0001",
    status: "confirmed",
    subtotal: 86100,
    tax: 0,
    discount: 0,
    shippingFee: 1500,
    total: 87600,
    createdAt: new Date("2026-08-28T02:58:00Z"),
    items: [
      {
        id: "item_1",
        productId: "prod_1",
        variantId: null,
        name: "Quilted Suede Backpack",
        sku: "VKT-065",
        quantity: 1,
        unitPrice: 45200,
        total: 45200,
        unitCost: 20000,
        totalCost: 20000,
        product: { images: [{ url: "https://cdn/first.png", isPrimary: false, sortOrder: 1 }] },
      },
    ],
    customer: {
      id: "cus_1",
      name: "Ada Okafor",
      email: "ada@example.com",
      phone: "+2348000000000",
      address: "12 Current Street, Lagos",
      avatarUrl: "https://cdn/avatar.png",
    },
    ...overrides,
  };
}

describe("resolveItemImage", () => {
  /**
   * The detail route used to hand `images[0]` to the client as `image`. That is
   * the whole ProductImage row, so the storefront put an object in a `src`, the
   * browser 404'd and fell back to the alt text, and every order line rendered
   * its product name twice.
   */
  it("returns a url string, never the image row", () => {
    const result = resolveItemImage([{ url: "https://cdn/a.png", isPrimary: true }]);
    expect(result).toBe("https://cdn/a.png");
    expect(typeof result).toBe("string");
  });

  it("prefers the primary image over the first one", () => {
    expect(
      resolveItemImage([
        { url: "https://cdn/a.png", isPrimary: false, sortOrder: 0 },
        { url: "https://cdn/b.png", isPrimary: true, sortOrder: 5 },
      ])
    ).toBe("https://cdn/b.png");
  });

  /** A product whose images were uploaded without one flagged primary. */
  it("falls back to the lowest sortOrder when nothing is primary", () => {
    expect(
      resolveItemImage([
        { url: "https://cdn/late.png", sortOrder: 9 },
        { url: "https://cdn/early.png", sortOrder: 1 },
      ])
    ).toBe("https://cdn/early.png");
  });

  it("returns null rather than undefined for a product with no images", () => {
    expect(resolveItemImage([])).toBeNull();
    expect(resolveItemImage(null)).toBeNull();
    expect(resolveItemImage(undefined)).toBeNull();
  });
});

describe("serializeStorefrontOrder", () => {
  it("emits an image url on every item", () => {
    const result = serializeStorefrontOrder(orderFixture());
    expect(result.items[0].image).toBe("https://cdn/first.png");
  });

  it("emits the customer's phone and address, which the confirmation page renders", () => {
    const result = serializeStorefrontOrder(orderFixture());
    expect(result.customer?.address).toBe("12 Current Street, Lagos");
    expect(result.customer?.phone).toBe("+2348000000000");
  });

  /**
   * The whole reason the snapshot columns exist. Customer.address is where they
   * live now; the order has to keep saying where this parcel went.
   */
  it("prefers the order's shipping snapshot over the customer's current address", () => {
    const result = serializeStorefrontOrder(
      orderFixture({
        shippingName: "Ada O.",
        shippingAddress: "5 Old Road, Ikeja",
        shippingPhone: "+2348111111111",
      })
    );
    expect(result.customer?.address).toBe("5 Old Road, Ikeja");
    expect(result.customer?.phone).toBe("+2348111111111");
    expect(result.customer?.name).toBe("Ada O.");
  });

  it("falls back to the customer row for orders placed before the snapshot existed", () => {
    const result = serializeStorefrontOrder(
      orderFixture({ shippingAddress: null, shippingPhone: null, shippingName: null })
    );
    expect(result.customer?.address).toBe("12 Current Street, Lagos");
  });

  /**
   * The pre-existing security property of this module, asserted so a future
   * edit that spreads the raw item cannot quietly publish margin.
   */
  it("never emits cost figures", () => {
    const serialized = JSON.stringify(serializeStorefrontOrder(orderFixture()));
    expect(serialized).not.toContain("unitCost");
    expect(serialized).not.toContain("totalCost");
    expect(serialized).not.toContain("20000");
  });

  it("handles a walk-in order with no customer", () => {
    const result = serializeStorefrontOrder(orderFixture({ customer: null }));
    expect(result.customer).toBeNull();
  });
});
