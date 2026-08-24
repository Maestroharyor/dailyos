/**
 * Server-authoritative order pricing.
 *
 * Both POST /api/storefront/orders and POST /api/storefront/quote call these,
 * so a quote and the order created from it cannot disagree. That matters more
 * than it looks: the order route verifies the Paystack amount against its own
 * recomputed total, so any drift between the two rejects a payment the customer
 * has already made.
 *
 * Nothing here trusts a client-sent price, subtotal or shipping fee.
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
}

export interface PricingProduct {
  id: string;
  name: string;
  sku: string;
  price: unknown;
  salePrice: unknown;
  costPrice: unknown;
  onSale: boolean;
  variants: {
    id: string;
    name: string;
    sku: string;
    price: unknown;
    costPrice: unknown;
  }[];
}

export interface RequestedItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export type PriceLinesResult =
  | { ok: true; lines: PricedLine[]; subtotal: number; totalCost: number }
  | { ok: false; error: string };

/**
 * Resolves each requested item to a priced line. A variant's own price wins;
 * otherwise the sale price applies when the product is on sale, which is the
 * rule the storefront displays.
 */
export function priceOrderLines(
  products: PricingProduct[],
  items: RequestedItem[]
): PriceLinesResult {
  const lines: PricedLine[] = [];
  let subtotal = 0;
  let totalCost = 0;

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) continue;

    let unitPrice: number;
    let unitCost: number;
    let name: string;
    let sku: string;
    let variantId: string | null = null;

    if (item.variantId) {
      const variant = product.variants.find((v) => v.id === item.variantId);
      if (!variant) {
        return {
          ok: false,
          error: `Variant ${item.variantId} not found for product ${product.name}`,
        };
      }
      unitPrice = Number(variant.price);
      unitCost = Number(variant.costPrice);
      name = `${product.name} - ${variant.name}`;
      sku = variant.sku;
      variantId = variant.id;
    } else {
      unitPrice =
        product.onSale && product.salePrice
          ? Number(product.salePrice)
          : Number(product.price);
      unitCost = Number(product.costPrice);
      name = product.name;
      sku = product.sku;
    }

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    totalCost += unitCost * item.quantity;

    lines.push({
      productId: product.id,
      variantId,
      name,
      sku,
      quantity: item.quantity,
      unitPrice,
      unitCost,
      total: lineTotal,
    });
  }

  return { ok: true, lines, subtotal, totalCost };
}

export interface OrderTotalsInput {
  subtotal: number;
  discount?: number;
  /** Percentage, e.g. 7.5 for 7.5%. */
  taxRate: number;
  shippingFee?: number;
  /**
   * CommerceSettings.taxOnDiscountedAmount. When true (the default) tax is
   * charged on what the customer actually pays for goods; when false it is
   * charged on the full pre-discount subtotal.
   */
  taxOnDiscountedAmount?: boolean;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shippingFee: number;
  total: number;
}

/**
 * The one place the storefront order total is defined.
 *
 * Whether a discount reduces the taxable base is a per-merchant setting
 * (CommerceSettings.taxOnDiscountedAmount) rather than a constant, because the
 * correct answer is jurisdictional. Both the quote and the order read the same
 * setting and call this, so the amount a customer is charged always equals the
 * amount the order route verifies against Paystack.
 *
 * Note: the POS / dashboard order path (src/lib/actions/commerce/orders.ts)
 * still computes its own totals from a client-supplied tax figure and does not
 * consult this setting. Unifying the two is deliberately out of scope here.
 */
export function computeOrderTotals({
  subtotal,
  discount = 0,
  taxRate,
  shippingFee = 0,
  taxOnDiscountedAmount = true,
}: OrderTotalsInput): OrderTotals {
  const safeSubtotal = round2(subtotal);
  // A discount can never exceed the goods value, and never makes shipping free.
  const safeDiscount = round2(Math.min(Math.max(discount, 0), safeSubtotal));
  const payableForGoods = safeSubtotal - safeDiscount;
  const taxable = taxOnDiscountedAmount ? payableForGoods : safeSubtotal;
  const tax = round2(taxable * (taxRate / 100));
  const safeShipping = round2(shippingFee);

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    tax,
    shippingFee: safeShipping,
    // The discount always comes off what is owed, regardless of how tax was
    // computed — only the taxable base changes with the setting.
    total: round2(payableForGoods + tax + safeShipping),
  };
}
