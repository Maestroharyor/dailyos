import type { DeliveryType, Prisma } from "@prisma/client";
import type { prisma } from "@/lib/db";
import { storePickupOptionId } from "./resolve";
import { NIGERIA_STATES } from "./states";

/**
 * The whole set of delivery options a storefront can offer, in one payload.
 *
 * Assembled server-side rather than left to the client for two reasons. Store
 * pickup lives in its own table with two price tiers, and deciding which tier a
 * customer falls into is a pricing decision that has no business happening in a
 * browser. And the sort order is what the shopper reads as "cheapest first", so
 * it is settled once here rather than reimplemented per consumer.
 */

export interface DeliveryCatalogOption {
  id: string;
  state: string;
  label: string;
  /** Charged for carriage. Zero for store pickup. */
  fee: number;
  /** A refundable hold, shown as its own line rather than folded into the fee. */
  deposit: number;
  deliveryType: DeliveryType;
  pickupAddress: string | null;
  noteKey: string | null;
  isPinned: boolean;
}

export interface DeliveryCatalogNote {
  key: string;
  label: string;
  body: string;
  isCollapsible: boolean;
}

export interface DeliveryCatalog {
  /** Every state that actually has at least one option, in display order. */
  states: string[];
  options: DeliveryCatalogOption[];
  notes: Record<string, DeliveryCatalogNote>;
}

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Pinned first, then cheapest, then alphabetical.
 *
 * There is deliberately no store-pickup special case. Pickup is free in the
 * home state and a small hold elsewhere, against carriage that starts at
 * several thousand, so cheapest-first already floats it to the top. An explicit
 * rule would only ever bite in the one situation where it is wrong: a merchant
 * who prices pickup above a delivery option and did not mean it pinned there.
 *
 * The alphabetical tiebreak is load-bearing rather than cosmetic. Lagos has six
 * options at one price, and without a stable last key they reorder between
 * loads, which reads as a broken page.
 */
export function sortDeliveryOptions(options: DeliveryCatalogOption[]): DeliveryCatalogOption[] {
  return [...options].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aCost = a.fee + a.deposit;
    const bCost = b.fee + b.deposit;
    if (aCost !== bCost) return aCost - bCost;
    return a.label.localeCompare(b.label);
  });
}

const STATE_ORDER = new Map<string, number>(NIGERIA_STATES.map((name, index) => [name, index]));

export async function buildDeliveryCatalog(db: Db, spaceId: string): Promise<DeliveryCatalog> {
  const [zones, noteRows, pickup] = await Promise.all([
    db.deliveryZone.findMany({
      where: { spaceId, isActive: true },
      select: {
        id: true,
        state: true,
        name: true,
        fee: true,
        deliveryType: true,
        pickupAddress: true,
        noteKey: true,
        isPinned: true,
      },
    }),
    db.deliveryNote.findMany({ where: { spaceId } }),
    db.storePickupSetting.findUnique({ where: { spaceId } }),
  ]);

  const options: DeliveryCatalogOption[] = zones.map((zone) => ({
    id: zone.id,
    state: zone.state,
    label: zone.name,
    fee: Number(zone.fee),
    deposit: 0,
    deliveryType: zone.deliveryType,
    pickupAddress: zone.pickupAddress,
    noteKey: zone.noteKey,
    isPinned: zone.isPinned,
  }));

  // Every state that has carriage also gets a pickup option, plus the home
  // state even when nothing is delivered there, because collecting in person is
  // always possible where the shop is.
  if (pickup?.isEnabled) {
    const pickupAddress =
      pickup.address?.trim() ||
      (
        await db.commerceSettings.findUnique({
          where: { spaceId },
          select: { storeAddress: true },
        })
      )?.storeAddress?.trim() ||
      null;

    const states = new Set(zones.map((z) => z.state));
    states.add(pickup.homeState);

    for (const state of states) {
      const isHome = state === pickup.homeState;
      const amount = Number(isHome ? pickup.homeFee : pickup.awayFee);
      const refundable = isHome ? false : pickup.awayFeeRefundable;
      options.push({
        id: storePickupOptionId(state),
        state,
        label: pickup.label,
        // A hold is reported as a deposit and never as a fee, so that the
        // storefront shows it on its own line and nothing downstream mistakes
        // it for money the shop has earned.
        fee: refundable ? 0 : amount,
        deposit: refundable ? amount : 0,
        deliveryType: "store_pickup",
        pickupAddress,
        noteKey: isHome ? pickup.homeNoteKey : pickup.awayNoteKey,
        isPinned: false,
      });
    }
  }

  const notes: Record<string, DeliveryCatalogNote> = {};
  for (const note of noteRows) {
    notes[note.key] = {
      key: note.key,
      label: note.label,
      body: note.body,
      isCollapsible: note.isCollapsible,
    };
  }

  // Only states that actually have something to pick. Offering a state whose
  // list then comes back empty is a dead end at the last step of checkout.
  const states = [...new Set(options.map((o) => o.state))].sort(
    (a, b) =>
      (STATE_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (STATE_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b)
  );

  return { states, options: sortDeliveryOptions(options), notes };
}
