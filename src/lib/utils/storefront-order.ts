/**
 * Storefront-safe order serialization.
 *
 * Deliberately omits unitCost and totalCost: those are internal margin figures
 * and must never reach the public API. Shared by the order list, the order
 * detail route, and the checkout response so all three agree on shape.
 */
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
  items: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: unknown;
    total: unknown;
  }>;
  customer: { id: string; name: string; email: string | null } | null;
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
    })),
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          email: order.customer.email,
        }
      : null,
    createdAt: order.createdAt,
  };
}
