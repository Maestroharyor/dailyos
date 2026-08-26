"use client";

import {
  useQuery,
  useSuspenseQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import type { ActionResponse } from "@/lib/action-response";

/** The subset of an inventory movement a caller reads back after a write. */
export interface StockMovement {
  id: string;
  inventoryItemId: string;
  type: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
}

import {
  addStock,
  adjustStock,
  listInventory,
  type AddStockInput,
  type AdjustStockInput,
} from "@/lib/actions/commerce/inventory";

// Types
export interface InventoryItem {
  id: string;
  spaceId: string;
  productId: string;
  variantId: string | null;
  location: string;
  currentStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    costPrice: number | null;
    images: Array<{ url: string }>;
  };
  variant: {
    id: string;
    name: string;
    sku: string;
    costPrice: number | null;
  } | null;
}

export interface InventoryStats {
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface InventoryResponse {
  inventory: InventoryItem[];
  threshold: number;
  stats: InventoryStats;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

export interface InventoryFilters {
  search?: string;
  stock?: StockFilter;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchInventory(
  spaceId: string,
  filters: InventoryFilters
): Promise<InventoryResponse> {
  return unwrapAction(listInventory(spaceId, filters));
}

// Query hooks
export function useInventory(spaceId: string, filters: InventoryFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.inventory.list(spaceId, filters),
    queryFn: () => fetchInventory(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useInventorySuspense(
  spaceId: string,
  filters: InventoryFilters = {}
) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.inventory.list(spaceId, filters),
    queryFn: () => fetchInventory(spaceId, filters),
  });
}

// Mutation hooks

/**
 * The movement a caller gets back when the adjustment was queued rather than
 * sent. Shaped like a real one; the id is the request id, not a server id.
 */
function queuedMovement(
  input: { inventoryItemId: string; quantity: number; notes?: string },
  requestId: string,
  type: "stock_in" | "adjustment"
): ActionResponse<StockMovement> {
  return {
    success: true,
    message: "Adjustment queued",
    data: {
      id: requestId,
      inventoryItemId: input.inventoryItemId,
      type,
      quantity: input.quantity,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
    },
  };
}

export function useAddStock(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // A delivery counted into a stockroom with no signal still has to land.
  return useOfflineMutation<
    AddStockInput,
    ActionResponse<StockMovement>,
    { previousInventory: InventoryResponse | undefined }
  >({
    mutationFn: wrapAction((input: AddStockInput) => addStock(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "stock",
    action: "add",
    toPayload: (input, requestId) => ({ ...input, clientRequestId: requestId }),
    toLocalResult: (input, requestId) => queuedMovement(input, requestId, "stock_in"),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });

      const previousInventory = queryClient.getQueryData<InventoryResponse>(
        queryKeys.commerce.inventory.list(spaceId, {})
      );

      if (previousInventory) {
        queryClient.setQueryData<InventoryResponse>(
          queryKeys.commerce.inventory.list(spaceId, {}),
          {
            ...previousInventory,
            inventory: previousInventory.inventory.map((item) =>
              item.id === input.inventoryItemId
                ? {
                    ...item,
                    currentStock: item.currentStock + input.quantity,
                    isLowStock:
                      item.currentStock + input.quantity <=
                      previousInventory.threshold,
                  }
                : item
            ),
          }
        );
      }

      return { previousInventory };
    },
    onError: (err, input, context) => {
      if (context?.previousInventory) {
        queryClient.setQueryData(
          queryKeys.commerce.inventory.list(spaceId, {}),
          context.previousInventory
        );
      }
      notifyError(err, "Couldn't add stock");
    },
    onSuccess: () => notifySuccess("Stock added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}

export function useAdjustStock(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useOfflineMutation<
    AdjustStockInput,
    ActionResponse<StockMovement>,
    { previousInventory: InventoryResponse | undefined }
  >({
    mutationFn: wrapAction((input: AdjustStockInput) => adjustStock(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "stock",
    action: "adjust",
    toPayload: (input, requestId) => ({ ...input, clientRequestId: requestId }),
    toLocalResult: (input, requestId) => queuedMovement(input, requestId, "adjustment"),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });

      const previousInventory = queryClient.getQueryData<InventoryResponse>(
        queryKeys.commerce.inventory.list(spaceId, {})
      );

      if (previousInventory) {
        queryClient.setQueryData<InventoryResponse>(
          queryKeys.commerce.inventory.list(spaceId, {}),
          {
            ...previousInventory,
            inventory: previousInventory.inventory.map((item) =>
              item.id === input.inventoryItemId
                ? {
                    ...item,
                    currentStock: item.currentStock + input.quantity,
                    isLowStock:
                      item.currentStock + input.quantity <=
                      previousInventory.threshold,
                  }
                : item
            ),
          }
        );
      }

      return { previousInventory };
    },
    onError: (err, input, context) => {
      if (context?.previousInventory) {
        queryClient.setQueryData(
          queryKeys.commerce.inventory.list(spaceId, {}),
          context.previousInventory
        );
      }
      notifyError(err, "Couldn't update stock");
    },
    onSuccess: () => notifySuccess("Stock updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}
