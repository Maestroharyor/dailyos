/**
 * The sale a cashier is part-way through, and the rules for changing it.
 *
 * Pure on purpose: the zustand store in `@/lib/stores/pos-cart-store` is a
 * thin persistence wrapper around these, so the stock ceiling and the
 * already-in-basket check can be tested without a browser.
 */

export interface POSCartLine {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  quantity: number;
  /**
   * Stock as it read when the line was last touched. The product grid
   * refreshes on its own; this is the ceiling the quantity stepper enforces,
   * not a live figure.
   */
  maxStock: number;
}

export interface POSAppliedDiscount {
  code: string;
  name: string;
  type: string;
  value: number;
  discountAmount: number;
}

export interface POSSale {
  /**
   * The idempotency key for *this* sale, minted the first time it is submitted
   * and held until it succeeds or the cart is cleared.
   *
   * It has to survive a retry, which is the whole point: the cashier presses
   * Complete Sale, the request times out, they press it again, and if the
   * first attempt actually reached the server, a fresh key would ring the sale
   * twice. It lives on the sale rather than in a ref so it also survives the
   * reload a persisted cart is there to survive.
   */
  requestId: string | null;
  lines: POSCartLine[];
  customerId: string;
  paymentMethod: string;
  /** What the cashier typed into the manual discount field, verbatim. */
  manualDiscount: string;
  /** What the cashier typed into the code field, validated or not. */
  discountCode: string;
  /**
   * A code the server accepted. Kept with the rest of the sale: it is no
   * staler after a reload than it is part-way through a long sale, and
   * `createOrder` re-validates the code when the order is created either way.
   */
  appliedDiscount: POSAppliedDiscount | null;
  notes: string;
}

export const EMPTY_SALE: POSSale = {
  requestId: null,
  lines: [],
  customerId: "",
  paymentMethod: "cash",
  manualDiscount: "",
  discountCode: "",
  appliedDiscount: null,
  notes: "",
};

/**
 * The key this sale is submitted under, minting one if it has none.
 *
 * Returns the sale unchanged when a key already exists, so a retry of the same
 * cart reuses it and the server recognises the second attempt.
 */
export function withRequestId(sale: POSSale, mint: () => string): POSSale {
  if (sale.requestId) return sale;
  return { ...sale, requestId: mint() };
}

/** A line as the caller supplies it: quantity and ceiling are ours to set. */
export type NewLine = Omit<POSCartLine, "quantity" | "maxStock">;

function sameLine(line: POSCartLine, candidate: NewLine): boolean {
  return line.productId === candidate.productId && line.variantId === candidate.variantId;
}

/**
 * Add one unit, or increment the line if the product/variant is already in
 * the basket. `stock` is the live figure from the grid: it caps the quantity
 * and becomes the line's ceiling.
 *
 * Returns the same object when nothing changed, so a store built on reference
 * equality does not re-render on a no-op.
 */
export function addLineToSale(
  sale: POSSale,
  line: NewLine,
  stock: number,
  options: { enforceStock?: boolean } = {}
): POSSale {
  const enforceStock = options.enforceStock ?? true;

  // Offline, the stock figure is whatever was true when the device last
  // reached the server, and refusing a sale on it means refusing to sell
  // goods that are physically on the shelf. The shop and the customer are both
  // right there; the number is the only thing that might be wrong. So the
  // ceiling becomes advisory, and the server records the discrepancy at sync.
  if (enforceStock && stock <= 0) return sale;

  const index = sale.lines.findIndex((l) => sameLine(l, line));

  if (index === -1) {
    return {
      ...sale,
      lines: [...sale.lines, { ...line, quantity: 1, maxStock: stock }],
    };
  }

  const existing = sale.lines[index];
  if (enforceStock && existing.quantity >= stock) return sale;

  const lines = [...sale.lines];
  // Refresh the ceiling from the live figure while we are here, so a restock
  // lifts the limit on a basket that is already open.
  lines[index] = {
    ...existing,
    quantity: existing.quantity + 1,
    maxStock: stock,
  };
  return { ...sale, lines };
}

/**
 * Step one line's quantity. Refuses to go below 1 (removing is a separate
 * action) or above the line's ceiling.
 */
export function changeLineQuantity(
  sale: POSSale,
  index: number,
  delta: number,
  options: { enforceStock?: boolean } = {}
): POSSale {
  const enforceStock = options.enforceStock ?? true;
  const existing = sale.lines[index];
  if (!existing) return sale;

  const quantity = existing.quantity + delta;
  // Below one is always refused: removing a line is a separate action, and
  // that has nothing to do with what the network is doing.
  if (quantity < 1) return sale;
  if (enforceStock && quantity > existing.maxStock) return sale;

  const lines = [...sale.lines];
  lines[index] = { ...existing, quantity };
  return { ...sale, lines };
}

export function removeLineFromSale(sale: POSSale, index: number): POSSale {
  if (!sale.lines[index]) return sale;
  return { ...sale, lines: sale.lines.filter((_, i) => i !== index) };
}

/**
 * Identifies a line for a stock lookup. A product with no variant uses "base",
 * matching how `getPOSProducts` keys `stockByVariant`.
 */
export function lineStockKey(line: { productId: string; variantId?: string }): string {
  return `${line.productId}:${line.variantId ?? "base"}`;
}

export interface SaleReconciliation {
  sale: POSSale;
  /** Lines whose quantity was cut to the stock that is actually there. */
  clamped: { name: string; from: number; to: number }[];
  /** Lines dropped because nothing is left to sell. */
  dropped: string[];
}

/**
 * Bring a restored sale back in line with what is actually in stock.
 *
 * Each line carries the stock figure that was live when it was added. Held in
 * `useState` that number went stale for as long as the tab was open; persisted,
 * it goes stale for as long as the terminal sits idle, across a shift change,
 * across a night. It is also the *only* ceiling in the path: `createOrder`
 * does no stock validation, so a cart restored the next morning would happily
 * sell units another till sold yesterday.
 *
 * `stock` maps `lineStockKey(line)` to the live figure. A key that is absent
 * is left alone rather than dropped, an absent key means "we did not ask
 * about this one", and deleting a customer's basket on a failed lookup is a
 * worse failure than a stale ceiling.
 */
export function reconcileSaleWithStock(
  sale: POSSale,
  stock: Map<string, number>
): SaleReconciliation {
  const clamped: SaleReconciliation["clamped"] = [];
  const dropped: string[] = [];
  const lines: POSCartLine[] = [];

  for (const line of sale.lines) {
    const live = stock.get(lineStockKey(line));
    if (live === undefined) {
      lines.push(line);
      continue;
    }

    if (live <= 0) {
      dropped.push(line.name);
      continue;
    }

    if (line.quantity > live) {
      clamped.push({ name: line.name, from: line.quantity, to: live });
      lines.push({ ...line, quantity: live, maxStock: live });
      continue;
    }

    // In stock and within the ceiling, still refresh the ceiling, so a
    // restock is usable without removing and re-adding the line.
    lines.push(line.maxStock === live ? line : { ...line, maxStock: live });
  }

  if (!clamped.length && !dropped.length && lines.every((l, i) => l === sale.lines[i])) {
    return { sale, clamped, dropped };
  }

  return { sale: { ...sale, lines }, clamped, dropped };
}
