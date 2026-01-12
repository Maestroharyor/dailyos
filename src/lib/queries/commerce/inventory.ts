"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  addStock,
  adjustStock,
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
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.stock && filters.stock !== "all") params.set("stock", filters.stock);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/inventory?${params}`);
  if (!response.ok) throw new Error("Failed to fetch inventory");
  const json = await response.json();
  return json.data;
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
export function useAddStock(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AddStockInput) => addStock(spaceId, input),
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
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}

export function useAdjustStock(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdjustStockInput) => adjustStock(spaceId, input),
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
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}
