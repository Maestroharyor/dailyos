import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import {
  addLineToSale,
  changeLineQuantity,
  removeLineFromSale,
  EMPTY_SALE,
  type NewLine,
  type POSAppliedDiscount,
  type POSSale,
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

export type { POSCartLine, POSAppliedDiscount, POSSale } from "@/lib/pos/sale";
export { EMPTY_SALE } from "@/lib/pos/sale";

interface POSCartState {
  sales: Record<string, POSSale>;
  _hasHydrated: boolean;
  actions: {
    addLine: (spaceId: string, line: NewLine, stock: number) => void;
    changeQuantity: (spaceId: string, index: number, delta: number) => void;
    removeLine: (spaceId: string, index: number) => void;
    setCustomerId: (spaceId: string, customerId: string) => void;
    setPaymentMethod: (spaceId: string, paymentMethod: string) => void;
    setManualDiscount: (spaceId: string, value: string) => void;
    setDiscountCode: (spaceId: string, value: string) => void;
    setAppliedDiscount: (
      spaceId: string,
      applied: POSAppliedDiscount | null
    ) => void;
    setNotes: (spaceId: string, notes: string) => void;
    /** Drop the whole sale — after it completes, or when abandoned. */
    clear: (spaceId: string) => void;
  };
}

/** Read-modify-write one space's sale, leaving every other space alone. */
function updateSale(
  state: POSCartState,
  spaceId: string,
  fn: (sale: POSSale) => POSSale
): Pick<POSCartState, "sales"> {
  const current = state.sales[spaceId] ?? EMPTY_SALE;
  return { sales: { ...state.sales, [spaceId]: fn(current) } };
}

export const usePOSCartStore = create<POSCartState>()(
  persist(
    (set) => ({
      sales: {},
      _hasHydrated: false,

      actions: {
        addLine: (spaceId, line, stock) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => addLineToSale(sale, line, stock))
          ),

        changeQuantity: (spaceId, index, delta) =>
          set((state) =>
            updateSale(state, spaceId, (sale) =>
              changeLineQuantity(sale, index, delta)
            )
          ),

        removeLine: (spaceId, index) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => removeLineFromSale(sale, index))
          ),

        setCustomerId: (spaceId, customerId) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => ({ ...sale, customerId }))
          ),

        setPaymentMethod: (spaceId, paymentMethod) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => ({ ...sale, paymentMethod }))
          ),

        setManualDiscount: (spaceId, manualDiscount) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => ({ ...sale, manualDiscount }))
          ),

        setDiscountCode: (spaceId, discountCode) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => ({ ...sale, discountCode }))
          ),

        setAppliedDiscount: (spaceId, appliedDiscount) =>
          set((state) =>
            updateSale(state, spaceId, (sale) => ({ ...sale, appliedDiscount }))
          ),

        setNotes: (spaceId, notes) =>
          set((state) => updateSale(state, spaceId, (sale) => ({ ...sale, notes }))),

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
    }
  )
);

export const usePOSSale = (spaceId: string): POSSale =>
  usePOSCartStore(useShallow((state) => state.sales[spaceId] ?? EMPTY_SALE));

export const usePOSCartActions = () => usePOSCartStore((state) => state.actions);

export const usePOSCartHasHydrated = () =>
  usePOSCartStore((state) => state._hasHydrated);
