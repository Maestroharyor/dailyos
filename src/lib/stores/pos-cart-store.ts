import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { ulid } from "@/lib/offline/ulid";
import {
  addLineToSale,
  changeLineQuantity,
  EMPTY_SALE,
  type NewLine,
  type POSAppliedDiscount,
  type POSSale,
  reconcileSaleWithStock,
  removeLineFromSale,
  type SaleReconciliation,
  withRequestId,
} from "@/lib/pos/sale";

/**
 * The sale a cashier is part-way through, kept in localStorage.
 *
 * A POS terminal is not a browser tab someone closes deliberately. It gets
 * refreshed, its battery dies, the wifi drops and the page reloads. Holding
 * the cart in `useState` meant every one of those lost a basket the customer
 * was standing in front of, and the only recovery was to ring it again.
 *
 * Sales are keyed by space so a user with two shops does not carry one shop's
 * basket into the other. The rules for changing a sale live in
 * `@/lib/pos/sale`; this file only stores the result.
 */

export type {
  POSAppliedDiscount,
  POSCartLine,
  POSSale,
  SaleReconciliation,
} from "@/lib/pos/sale";
export { EMPTY_SALE } from "@/lib/pos/sale";

interface POSCartState {
  sales: Record<string, POSSale>;
  _hasHydrated: boolean;
  actions: {
    /**
     * `enforceStock: false` lets a sale exceed the last known stock figure.
     * Passed when the device is offline, where that figure is only as fresh as
     * the last successful sync and refusing on it means refusing to sell goods
     * that are on the shelf.
     */
    addLine: (
      spaceId: string,
      line: NewLine,
      stock: number,
      options?: { enforceStock?: boolean },
    ) => void;
    changeQuantity: (
      spaceId: string,
      index: number,
      delta: number,
      options?: { enforceStock?: boolean },
    ) => void;
    removeLine: (spaceId: string, index: number) => void;
    setCustomerId: (spaceId: string, customerId: string) => void;
    setPaymentMethod: (spaceId: string, paymentMethod: string) => void;
    setManualDiscount: (spaceId: string, value: string) => void;
    setDiscountCode: (spaceId: string, value: string) => void;
    setAppliedDiscount: (spaceId: string, applied: POSAppliedDiscount | null) => void;
    setNotes: (spaceId: string, notes: string) => void;
    /**
     * The key this sale is submitted under, minted on first use and stable
     * across retries of the same cart.
     */
    takeRequestId: (spaceId: string) => string;
    /**
     * Clamp a restored sale to what is actually in stock, returning what
     * changed so the page can tell the cashier.
     */
    reconcileWithStock: (
      spaceId: string,
      stock: Map<string, number>,
    ) => Omit<SaleReconciliation, "sale">;
    /** Drop the whole sale — after it completes, or when abandoned. */
    clear: (spaceId: string) => void;
  };
}

/**
 * Read-modify-write one space's sale, leaving every other space alone.
 *
 * **Any change to the sale drops its idempotency key.** The key says "this
 * exact sale"; once the basket, the customer or the discount changes, it is a
 * different sale and must be submitted under a different key.
 *
 * Without this: a cashier submits, the request appears to fail but actually
 * lands, they add a forgotten item and press Complete Sale again — and the
 * server, doing exactly what an idempotency key asks of it, returns the
 * original order. The added item goes unbilled and nobody is told. That is
 * precisely the case these keys exist to catch, so the key has to be dropped
 * where the edit happens rather than reasoned about at the server.
 */
function updateSale(
  state: POSCartState,
  spaceId: string,
  fn: (sale: POSSale) => POSSale,
): Pick<POSCartState, "sales"> {
  const current = state.sales[spaceId] ?? EMPTY_SALE;
  const next = fn(current);
  // Unchanged means unchanged: a no-op must not invalidate a key mid-retry.
  if (next === current) return { sales: state.sales };
  return {
    sales: { ...state.sales, [spaceId]: { ...next, requestId: null } },
  };
}

/**
 * A plain field setter, no-op aware.
 *
 * `updateSale` decides "did anything change?" by reference, so a setter that
 * always spreads into a new object would burn the idempotency key even when
 * handed the value the sale already holds. Nothing in the POS UI does that
 * today, but the outbox retries mutations from stored payloads, and a replay
 * that re-applies the same customer id must not invalidate the key it is
 * retrying under.
 */
function setField<K extends keyof POSSale>(key: K, value: POSSale[K]) {
  return (sale: POSSale): POSSale => (sale[key] === value ? sale : { ...sale, [key]: value });
}

export const usePOSCartStore = create<POSCartState>()(
  persist(
    (set, get) => ({
      sales: {},
      _hasHydrated: false,

      actions: {
        addLine: (spaceId, line, stock, options) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => addLineToSale(sale, line, stock, options)),
          ),

        changeQuantity: (spaceId, index, delta, options) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => changeLineQuantity(sale, index, delta, options)),
          ),

        removeLine: (spaceId, index) =>
          set((state) => updateSale(state, spaceId, (sale) => removeLineFromSale(sale, index))),

        setCustomerId: (spaceId, customerId) =>
          set((state) => updateSale(state, spaceId, setField("customerId", customerId))),

        setPaymentMethod: (spaceId, paymentMethod) =>
          set((state) => updateSale(state, spaceId, setField("paymentMethod", paymentMethod))),

        setManualDiscount: (spaceId, manualDiscount) =>
          set((state) => updateSale(state, spaceId, setField("manualDiscount", manualDiscount))),

        setDiscountCode: (spaceId, discountCode) =>
          set((state) => updateSale(state, spaceId, setField("discountCode", discountCode))),

        setAppliedDiscount: (spaceId, appliedDiscount) =>
          set((state) => updateSale(state, spaceId, setField("appliedDiscount", appliedDiscount))),

        setNotes: (spaceId, notes) =>
          set((state) => updateSale(state, spaceId, setField("notes", notes))),

        takeRequestId: (spaceId) => {
          const current = get().sales[spaceId] ?? EMPTY_SALE;
          const next = withRequestId(current, ulid);
          if (next !== current) {
            set((state) => ({ sales: { ...state.sales, [spaceId]: next } }));
          }
          // Non-null by construction: withRequestId always returns one.
          return next.requestId ?? ulid();
        },

        reconcileWithStock: (spaceId, stock) => {
          const current = get().sales[spaceId];
          if (!current) return { clamped: [], dropped: [] };

          const { sale, clamped, dropped } = reconcileSaleWithStock(current, stock);
          if (sale !== current) {
            // Reconciliation changes what would be billed, so it invalidates
            // the key for the same reason a cashier's edit does.
            set((state) => ({
              sales: { ...state.sales, [spaceId]: { ...sale, requestId: null } },
            }));
          }
          return { clamped, dropped };
        },

        clear: (spaceId) =>
          set((state) => {
            // Drop the key rather than storing an empty sale, so localStorage
            // does not accumulate one entry per space ever visited.
            const sales = { ...state.sales };
            delete sales[spaceId];
            return { sales };
          }),
      },
    }),
    {
      name: "dailyos-pos-cart",
      version: 1,
      partialize: (state) => ({ sales: state.sales }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<POSCartState>),
        actions: currentState.actions,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
        }
      },
    },
  ),
);

export const usePOSSale = (spaceId: string): POSSale =>
  usePOSCartStore(useShallow((state) => state.sales[spaceId] ?? EMPTY_SALE));

export const usePOSCartActions = () => usePOSCartStore((state) => state.actions);

export const usePOSCartHasHydrated = () => usePOSCartStore((state) => state._hasHydrated);
