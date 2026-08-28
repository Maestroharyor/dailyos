/**
 * Storefront-safe order serialization.
 *
 * Deliberately omits unitCost and totalCost: those are internal margin figures
 * and must never reach the public API. Shared by the order list, the order
 * detail route, and the checkout response so all three agree on shape.
 *
 * That sharing is the point, and it is also how four separate storefront bugs
 * happened at once. This function used to drop the customer's phone and
 * address and to emit no image at all, so the confirmation page rendered grey
 * placeholder boxes and a delivery panel with nothing but a name in it, while
 * the markup that would have shown the address sat there behind an {#if} that
 * was never true. Anything the storefront needs to render an order belongs
 * here rather than being patched on at one call site.
 */

/** A product image row, or the subset of one this module needs. */
interface ImageLike {
  url: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

/**
 * Primary first, then lowest sortOrder, then whatever is there.
 *
 * The order detail route used to hand `images[0]` straight to the client as
 * `image`, which is the whole row rather than a URL. It serialized to JSON as
 * an object, the storefront put it in a `src`, and the browser rendered the
 * alt text instead, so every line showed its product name twice.
 */
export function resolveItemImage(images: ImageLike[] | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  const primary = images.find((image) => image.isPrimary);
  if (primary) return primary.url;
  const sorted = [...images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted[0]?.url ?? null;
}

export function serializeStorefrontOrder(order: {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: unknown;
  tax: unknown;
  discount?: unknown;
  discountCode?: string | null;
  shippingFee: unknown;
  total: unknown;
  createdAt: Date;
  shippingName?: string | null;
  shippingAddress?: string | null;
  shippingPhone?: string | null;
  items: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: unknown;
    total: unknown;
    product?: { images?: ImageLike[] | null } | null;
  }>;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone?: string | null;
    address?: string | null;
    avatarUrl?: string | null;
  } | null;
}) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    discount: Number(order.discount ?? 0),
    discountCode: order.discountCode ?? null,
    shippingFee: Number(order.shippingFee),
    total: Number(order.total),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      total: Number(i.total),
      image: resolveItemImage(i.product?.images),
    })),
    customer: order.customer
      ? {
          id: order.customer.id,
          // The order's own snapshot wins over the customer row. The customer
          // row holds where they live *now*; these three hold where this
          // parcel went. Falling back matters only for orders placed before
          // the snapshot columns existed.
          name: order.shippingName ?? order.customer.name,
          email: order.customer.email,
          phone: order.shippingPhone ?? order.customer.phone ?? null,
          address: order.shippingAddress ?? order.customer.address ?? null,
          avatarUrl: order.customer.avatarUrl ?? null,
        }
      : null,
    createdAt: order.createdAt,
  };
}
