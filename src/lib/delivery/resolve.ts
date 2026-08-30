import type { DeliveryType, Prisma } from "@prisma/client";
import type { prisma } from "@/lib/db";
import { type NigerianState, normalizeState, statesMatch } from "./states";

/**
 * Resolving a delivery selection to a price, server-side, once.
 *
 * Both POST /api/storefront/quote and POST /api/storefront/orders go through
 * here so a quote and the order created from it cannot disagree. The order
 * route re-verifies its own total against the amount Paystack actually took, so
 * any drift between the two rejects a payment the customer has already made.
 *
 * Nothing here trusts a client-sent fee.
 */

/** Store pickup has no DeliveryZone row, so its option id is minted here. */
const PICKUP_PREFIX = "pickup:";

export const storePickupOptionId = (state: string) => `${PICKUP_PREFIX}${state}`;
export const isStorePickupOptionId = (id: string) => id.startsWith(PICKUP_PREFIX);

export interface ResolvedDelivery {
  /** Null for store pickup, which is not a DeliveryZone row. */
  deliveryZoneId: string | null;
  deliveryType: DeliveryType;
  state: NigerianState;
  label: string;
  /** What is charged for carriage. Zero for store pickup. */
  shippingFee: number;
  /** A refundable hold. Zero for everything except away-state store pickup. */
  deposit: number;
  qualifiesForFreeShipping: boolean;
  pickupAddress: string | null;
  note: string | null;
}

export type ResolveResult = { ok: true; delivery: ResolvedDelivery } | { ok: false; error: string };

// `typeof prisma` rather than PrismaClient: the client in @/lib/db is
// $extends-ed with a retry wrapper, which widens its type past the base one.
type Db = typeof prisma | Prisma.TransactionClient;

async function noteBody(db: Db, spaceId: string, key: string | null): Promise<string | null> {
  if (!key) return null;
  const note = await db.deliveryNote.findUnique({
    where: { spaceId_key: { spaceId, key } },
    select: { body: true },
  });
  return note?.body ?? null;
}

/**
 * Resolves `optionId` against the delivery zones and the store pickup settings
 * of one space, for a customer in `rawState`.
 *
 * The state is checked against the option in both branches. Without that, an
 * address in Kano submitted with a Lagos option id is accepted at the Lagos
 * price: looking the fee up server-side proves the *option* is real, but says
 * nothing about whether it belongs to the address the parcel is going to.
 */
export async function resolveDeliverySelection(
  db: Db,
  params: { spaceId: string; optionId: string; state: string | null | undefined }
): Promise<ResolveResult> {
  const { spaceId, optionId } = params;
  const state = normalizeState(params.state);
  if (!state) {
    return { ok: false, error: "Select the state your order is going to" };
  }

  if (isStorePickupOptionId(optionId)) {
    const setting = await db.storePickupSetting.findUnique({ where: { spaceId } });
    if (!setting?.isEnabled) {
      return { ok: false, error: "Store pickup is not available" };
    }

    // The id carries the state it was priced for, so a stale tab that picked
    // pickup in Lagos cannot be replayed against a Kano address to buy the free
    // home-state rate. Home versus away is a pricing decision and it is made
    // here, never in the browser.
    const idState = optionId.slice(PICKUP_PREFIX.length);
    if (!statesMatch(idState, state)) {
      return { ok: false, error: "The selected pickup option does not match your state" };
    }

    const isHome = statesMatch(setting.homeState, state);
    const fee = Number(isHome ? setting.homeFee : setting.awayFee);
    const refundable = isHome ? false : setting.awayFeeRefundable;

    // A refundable hold is reported as a deposit, never as a shipping fee. Only
    // a genuinely non-refundable pickup charge would be revenue.
    const settingAddress = setting.address?.trim();
    const fallbackAddress = settingAddress
      ? null
      : (
          await db.commerceSettings.findUnique({
            where: { spaceId },
            select: { storeAddress: true },
          })
        )?.storeAddress?.trim() || null;

    return {
      ok: true,
      delivery: {
        deliveryZoneId: null,
        deliveryType: "store_pickup",
        state,
        label: setting.label,
        shippingFee: refundable ? 0 : fee,
        deposit: refundable ? fee : 0,
        // A hold is not a price, so a free shipping threshold has no business
        // waiving it. Flagged false so that stays true even if the flag is ever
        // read without checking the deposit field.
        qualifiesForFreeShipping: false,
        pickupAddress: settingAddress || fallbackAddress,
        note: await noteBody(db, spaceId, isHome ? setting.homeNoteKey : setting.awayNoteKey),
      },
    };
  }

  const zone = await db.deliveryZone.findFirst({
    where: { id: optionId, spaceId, isActive: true },
  });
  if (!zone) {
    return { ok: false, error: "The selected delivery option is no longer available" };
  }

  if (!statesMatch(zone.state, state)) {
    return { ok: false, error: "The selected delivery option is not available in your state" };
  }

  return {
    ok: true,
    delivery: {
      deliveryZoneId: zone.id,
      deliveryType: zone.deliveryType,
      state,
      label: zone.name,
      shippingFee: Number(zone.fee),
      deposit: 0,
      qualifiesForFreeShipping: zone.qualifiesForFreeShipping,
      pickupAddress: zone.pickupAddress,
      note: await noteBody(db, spaceId, zone.noteKey),
    },
  };
}
