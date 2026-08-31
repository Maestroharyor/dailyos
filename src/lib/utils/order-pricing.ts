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

/**
 * The product's markdown as a ratio, or null when there is no usable markdown.
 *
 * One guard set, shared by both pricing paths, because they used to disagree.
 *
 * The `Number()` conversions are the load-bearing part. `salePrice` arrives as
 * a Prisma `Decimal`, which is an object, and every non-null object is truthy —
 * so the `product.onSale && product.salePrice` test both call sites used would
 * pass for a stored `Decimal(0)` and price the line at zero. A primitive `0`
 * would have fallen through to the list price, which is why the first version
 * of the test for this passed while the production path stayed broken.
 *
 * Three things are refused, each of which would otherwise reach Paystack as an
 * amount:
 *   - a base price of zero or worse: there is no ratio to take, and dividing by
 *     it yields Infinity or NaN.
 *   - a sale price at or above the base: a typo, not a markdown, and honouring
 *     it would charge above the shelf price.
 *   - a sale price of zero: an empty column rather than "free".
 */
function saleRatio(product: {
  price: unknown;
  salePrice: unknown;
  onSale: boolean;
}): number | null {
  if (!product.onSale || product.salePrice === null || product.salePrice === undefined) return null;

  const base = Number(product.price);
  const sale = Number(product.salePrice);
  if (!Number.isFinite(base) || base <= 0) return null;
  if (!Number.isFinite(sale) || sale <= 0 || sale >= base) return null;

  return sale / base;
}

/** What one unit of an unvariated product costs, with its sale applied. */
export function productUnitPrice(product: {
  price: unknown;
  salePrice: unknown;
  onSale: boolean;
}): number {
  // The sale price itself, not base x ratio: the ratio is a division and
  // multiplying it back would reintroduce a float the merchant never typed.
  return saleRatio(product) === null ? Number(product.price) : Number(product.salePrice);
}

/**
 * What one unit of a variant costs, with the product's sale applied.
 *
 * A ProductVariant has a price and no sale price, so a discounted product used
 * to lose its discount the moment a shopper picked a size: the storefront kept
 * showing "-20% OFF" and this function charged the variant's full price. Each
 * half was defensible on its own, which is how it survived — a variant's price
 * is its own, and a sale price is the product's. Together they advertised a
 * discount and did not give it.
 *
 * The markdown is treated as a ratio instead. A 50,000 bag marked to 40,000 is
 * x0.8, so its 60,000 30cm variant sells at 48,000 and the badge tells the
 * truth. That keeps per-variant pricing, which the merchant sets deliberately,
 * and needs no new column.
 */
export function variantUnitPrice(
  product: { price: unknown; salePrice: unknown; onSale: boolean },
  variant: { price: unknown }
): number {
  const variantPrice = Number(variant.price);
  const ratio = saleRatio(product);
  if (ratio === null) return variantPrice;

  // Whole units. Naira orders are whole naira, and a fractional unit price
  // multiplied by a quantity is how a total drifts from the one Paystack was
  // charged.
  return Math.round(variantPrice * ratio);
}

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
 * Resolves each requested item to a priced line.
 *
 * A product's sale applies either way: on its own price when there is no
 * variant, and as a ratio on the variant's price when there is. See
 * variantUnitPrice for why the ratio rather than the sale price itself.
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
      unitPrice = variantUnitPrice(product, variant);
      unitCost = Number(variant.costPrice);
      name = `${product.name} - ${variant.name}`;
      sku = variant.sku;
      variantId = variant.id;
    } else {
      unitPrice = productUnitPrice(product);
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
  /**
   * CommerceSettings.freeShippingThreshold. Shipping is waived once the
   * discounted goods amount reaches it. 0 disables free shipping entirely.
   */
  freeShippingThreshold?: number;
  /**
   * DeliveryZone.qualifiesForFreeShipping for the option the customer chose.
   *
   * The threshold is one number but the fees it would waive run from 3,000 to
   * 10,000, so a flat rule absorbs three times as much on a distant order as on
   * a local one for identical revenue. This flag is how a merchant decides
   * which options the offer actually applies to. Defaults to true so that
   * callers with no delivery concept at all (the POS path) behave as before.
   */
  shippingQualifiesForFreeShipping?: boolean;
  /**
   * A refundable hold, e.g. a store-pickup deposit returned on collection.
   *
   * Deliberately a separate input from shippingFee rather than a bigger
   * shipping number. It is not revenue, it pays no courier, and it must not be
   * discounted, taxed, or waived by the free shipping threshold. Keeping it in
   * its own field means none of those exclusions need to be written as special
   * cases: they fall out of it never entering those calculations.
   */
  deposit?: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  /** What is actually charged for shipping, 0 when the order qualified. */
  shippingFee: number;
  /** True when a non-zero shipping fee was waived by the threshold. */
  freeShippingApplied: boolean;
  /** The refundable hold charged on top. Never taxed, discounted or waived. */
  deposit: number;
  total: number;
}

/**
 * The one place an order total is defined.
 *
 * Whether a discount reduces the taxable base is a per-merchant setting
 * (CommerceSettings.taxOnDiscountedAmount) rather than a constant, because the
 * correct answer is jurisdictional. Both the quote and the order read the same
 * setting and call this, so the amount a customer is charged always equals the
 * amount the order route verifies against Paystack.
 *
 * The POS / dashboard order path (src/lib/actions/commerce/orders.ts) prices
 * through here too, so a cart totals the same whichever door it came through.
 */
export function computeOrderTotals({
  subtotal,
  discount = 0,
  taxRate,
  shippingFee = 0,
  taxOnDiscountedAmount = true,
  freeShippingThreshold = 0,
  shippingQualifiesForFreeShipping = true,
  deposit = 0,
}: OrderTotalsInput): OrderTotals {
  const safeSubtotal = round2(subtotal);
  // A discount can never exceed the goods value, and never makes shipping free.
  const safeDiscount = round2(Math.min(Math.max(discount, 0), safeSubtotal));
  const payableForGoods = safeSubtotal - safeDiscount;
  const taxable = taxOnDiscountedAmount ? payableForGoods : safeSubtotal;
  const tax = round2(taxable * (taxRate / 100));
  const requestedShipping = round2(Math.max(shippingFee, 0));

  // Qualification is measured on what the customer actually pays for goods, not
  // on the list subtotal: a threshold met only by items that were then
  // discounted away is not a threshold the customer reached. Tax and the
  // shipping fee itself are excluded, including shipping would let the fee pay
  // for its own waiver.
  //
  // A threshold of 0 means the feature is off, not "everything ships free",
  // which is why this tests the threshold before comparing.
  const safeThreshold = round2(Math.max(freeShippingThreshold, 0));
  const qualifies =
    safeThreshold > 0 && payableForGoods >= safeThreshold && shippingQualifiesForFreeShipping;
  const safeShipping = qualifies ? 0 : requestedShipping;

  // The hold is added last and touched by nothing above it. It is not part of
  // the taxable base, the discount cannot eat it, and the threshold cannot
  // waive it, because a deposit the customer gets back is not a price.
  const safeDeposit = round2(Math.max(deposit, 0));

  return {
    subtotal: safeSubtotal,
    discount: safeDiscount,
    tax,
    shippingFee: safeShipping,
    freeShippingApplied: qualifies && requestedShipping > 0,
    deposit: safeDeposit,
    // The discount always comes off what is owed, regardless of how tax was
    // computed, only the taxable base changes with the setting.
    total: round2(payableForGoods + tax + safeShipping + safeDeposit),
  };
}
