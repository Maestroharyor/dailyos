import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resolveDeliverySelection } from "@/lib/delivery/resolve";
import { checkRateLimit, rateLimitedResponse, storefrontRateKey } from "@/lib/rate-limit";
import {
  corsResponse,
  storefrontError,
  storefrontSuccess,
  validateStorefrontKey,
} from "@/lib/storefront-auth";
import { evaluateDiscountCode } from "@/lib/utils/discounts";
import { getStockByInventoryItems } from "@/lib/utils/inventory";
import {
  computeOrderTotals,
  priceOrderLines,
  productUnitPrice,
  variantUnitPrice,
} from "@/lib/utils/order-pricing";

const MAX_ITEMS = 100;

interface QuoteItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

interface QuotePayload {
  items: QuoteItem[];
  /** Zone row id, or a `pickup:<state>` id minted by the delivery-zones read. */
  deliveryOptionId?: string;
  /** Accepted as an alias for deliveryOptionId so older clients keep working. */
  deliveryZoneId?: string;
  /** The state the order is going to. Required to price any delivery option. */
  deliveryState?: string;
  discountCode?: string;
  customerEmail?: string;
}

interface QuoteLine {
  productId: string;
  variantId: string | null;
  name: string;
  requested: number;
  available: number;
  unitPrice: number;
  ok: boolean;
  issue: string | null;
}

function parseItems(raw: unknown): QuoteItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return null;

  const items: QuoteItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const { productId, variantId, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || !productId) return null;
    if (variantId !== undefined && variantId !== null && typeof variantId !== "string") {
      return null;
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      return null;
    }
    items.push({
      productId,
      variantId: typeof variantId === "string" && variantId ? variantId : undefined,
      quantity,
    });
  }
  return items;
}

export async function OPTIONS(request: NextRequest) {
  return corsResponse(request);
}

/**
 * POST /api/storefront/quote
 *
 * Prices a cart exactly the way POST /api/storefront/orders will, and reports
 * anything that would make that order fail: an unpublished product, a variant
 * that no longer exists, insufficient stock, a dead delivery zone, a rejected
 * coupon.
 *
 * The storefront calls this immediately before opening the payment popup and
 * charges the `total` it returns. That is what keeps the charged amount equal
 * to the amount the order route verifies against Paystack, the two share
 * priceOrderLines and computeOrderTotals, so they cannot drift.
 *
 * Read-only: it creates no customer, holds no stock, and reserves no coupon.
 */
export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(`quote:${storefrontRateKey(request)}`, {
      capacity: 30,
      refillPerSec: 0.5,
    });
    if (!rate.ok) {
      return rateLimitedResponse(rate.retryAfter, request);
    }

    const ctx = await validateStorefrontKey(request);
    if (!ctx) {
      return storefrontError("Invalid or missing storefront key", 401, request);
    }

    const body = (await request.json().catch(() => null)) as QuotePayload | null;
    const items = parseItems(body?.items);
    if (!items) {
      return storefrontError("Cart is invalid", 400, request);
    }

    const uniqueProductIds = [...new Set(items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: {
        id: { in: uniqueProductIds },
        spaceId: ctx.spaceId,
        status: "active",
        isPublished: true,
        // Present so a quote sees the same catalog a shopper does
      },
      include: { variants: true, inventoryItems: { select: { id: true, variantId: true } } },
    });

    const byId = new Map(products.map((p) => [p.id, p]));

    // One grouped aggregate for every inventory item in the cart, rather than
    // a query per line, same approach as the rest of the commerce reads.
    const inventoryItemIds = products.flatMap((p) => p.inventoryItems.map((i) => i.id));
    const stockByItem = await getStockByInventoryItems(inventoryItemIds);

    const lines: QuoteLine[] = [];
    const issues: string[] = [];
    const priceableItems: QuoteItem[] = [];

    for (const item of items) {
      const product = byId.get(item.productId);

      if (!product) {
        const issue = "One of your items is no longer available";
        issues.push(issue);
        lines.push({
          productId: item.productId,
          variantId: item.variantId ?? null,
          name: "This item",
          requested: item.quantity,
          available: 0,
          unitPrice: 0,
          ok: false,
          issue,
        });
        continue;
      }

      const variant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : undefined;

      if (item.variantId && !variant) {
        const issue = `The selected option for ${product.name} is no longer available`;
        issues.push(issue);
        lines.push({
          productId: product.id,
          variantId: item.variantId,
          name: product.name,
          requested: item.quantity,
          available: 0,
          unitPrice: 0,
          ok: false,
          issue,
        });
        continue;
      }

      // Same rule as priceOrderLines, and it has to stay that way: the order
      // route verifies the Paystack amount against its own recomputed total, so
      // a quote that priced a variant differently would reject a payment the
      // customer has already made.
      const unitPrice = variant ? variantUnitPrice(product, variant) : productUnitPrice(product);

      // Stock is tracked per inventory item; a variant has its own, an
      // unvariated product sums the ones not tied to a variant.
      const available = product.inventoryItems
        .filter((i) => (variant ? i.variantId === variant.id : i.variantId === null))
        .reduce((sum, i) => sum + (stockByItem.get(i.id) ?? 0), 0);

      const name = variant ? `${product.name} - ${variant.name}` : product.name;

      let issue: string | null = null;
      if (available <= 0) {
        issue = `${name} is out of stock`;
      } else if (available < item.quantity) {
        issue = `Only ${available} left of ${name}`;
      }
      if (issue) issues.push(issue);

      lines.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        name,
        requested: item.quantity,
        available,
        unitPrice,
        ok: issue === null,
        issue,
      });
      priceableItems.push(item);
    }

    // Subtotal comes from the shared pricer so it matches the order route
    // line-for-line, not from the display prices assembled above.
    const priced = priceOrderLines(products, priceableItems);
    const subtotal = priced.ok ? priced.subtotal : 0;

    // A dead or mismatched option is an issue here and a 400 on the order route.
    // That split is deliberate: a shopper who had checkout open while an option
    // was retired should see their cart and a reason to pick again, but must
    // never be able to submit the stale choice.
    let shippingFee = 0;
    let deposit = 0;
    let shippingQualifiesForFreeShipping = true;
    const optionId = body?.deliveryOptionId || body?.deliveryZoneId;
    if (optionId) {
      const resolved = await resolveDeliverySelection(prisma, {
        spaceId: ctx.spaceId,
        optionId,
        state: body?.deliveryState,
      });
      if (!resolved.ok) {
        issues.push(resolved.error);
      } else {
        shippingFee = resolved.delivery.shippingFee;
        deposit = resolved.delivery.deposit;
        shippingQualifiesForFreeShipping = resolved.delivery.qualifiesForFreeShipping;
      }
    }

    const settings = await prisma.commerceSettings.findUnique({
      where: { spaceId: ctx.spaceId },
      select: {
        taxRate: true,
        currency: true,
        taxOnDiscountedAmount: true,
        freeShippingThreshold: true,
      },
    });
    const taxRate = Number(settings?.taxRate ?? 0);

    let discountAmount = 0;
    let discountCode: string | null = null;
    if (body?.discountCode?.trim()) {
      const email = body.customerEmail?.trim().toLowerCase();
      const customer = email
        ? await prisma.customer.findUnique({
            where: { spaceId_email: { spaceId: ctx.spaceId, email } },
            select: { id: true },
          })
        : null;

      const evaluation = await evaluateDiscountCode(prisma, {
        spaceId: ctx.spaceId,
        code: body.discountCode,
        orderTotal: subtotal,
        customerId: customer?.id,
        productIds: lines.map((l) => l.productId),
        currency: settings?.currency ?? "NGN",
      });

      // A bad code is an issue to show the shopper, not a 4xx: the rest of the
      // quote is still valid and they should see their cart alongside the
      // reason the coupon didn't take.
      if (evaluation.ok) {
        discountAmount = evaluation.discount.discountAmount;
        discountCode = evaluation.discount.code;
      } else {
        issues.push(evaluation.error);
      }
    }

    const totals = computeOrderTotals({
      subtotal,
      discount: discountAmount,
      taxRate,
      shippingFee,
      taxOnDiscountedAmount: settings?.taxOnDiscountedAmount ?? true,
      freeShippingThreshold: Number(settings?.freeShippingThreshold ?? 0),
      shippingQualifiesForFreeShipping,
      deposit,
    });

    return storefrontSuccess(
      {
        ok: issues.length === 0,
        lines,
        issues,
        currency: settings?.currency ?? "NGN",
        taxRate,
        discountCode,
        ...totals,
      },
      "Quote generated",
      request
    );
  } catch (error) {
    console.error("Storefront quote error:", error);
    return storefrontError("Failed to price cart", 500, request);
  }
}
