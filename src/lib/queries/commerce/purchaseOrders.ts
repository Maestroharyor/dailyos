"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  receiveItems,
  deletePurchaseOrder,
  type CreatePurchaseOrderInput,
  type ReceiveItemsInput,
} from "@/lib/actions/commerce/purchaseOrders";
import type { PurchaseOrderStatus } from "@prisma/client";

// Types
export interface PurchaseOrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  spaceId: string;
  orderNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  notes: string | null;
  expectedDate: string | null;
  receivedDate: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string };
  items: PurchaseOrderItem[];
}

export interface PurchaseOrdersResponse {
  purchaseOrders: PurchaseOrder[];
  stats: Array<{
    status: string;
    count: number;
    total: number;
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PurchaseOrderFilters {
  search?: string;
  status?: string;
  supplierId?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchPurchaseOrders(
  spaceId: string,
  filters: PurchaseOrderFilters
): Promise<PurchaseOrdersResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/purchase-orders?${params}`);
  if (!response.ok) throw new Error("Failed to fetch purchase orders");
  const json = await response.json();
  return json.data;
}

// Query hooks
export function usePurchaseOrders(spaceId: string, filters: PurchaseOrderFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.purchaseOrders.list(spaceId, filters),
    queryFn: () => fetchPurchaseOrders(spaceId, filters),
    enabled: !!spaceId,
  });
}

// Mutation hooks
export function useCreatePurchaseOrder(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) => createPurchaseOrder(spaceId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
    },
  });
}

export function useUpdatePurchaseOrderStatus(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      status,
    }: {
      purchaseOrderId: string;
      status: PurchaseOrderStatus;
    }) => updatePurchaseOrderStatus(spaceId, purchaseOrderId, status),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
    },
  });
}

export function useReceiveItems(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      purchaseOrderId,
      input,
    }: {
      purchaseOrderId: string;
      input: ReceiveItemsInput;
    }) => receiveItems(spaceId, purchaseOrderId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}

export function useDeletePurchaseOrder(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (purchaseOrderId: string) => deletePurchaseOrder(spaceId, purchaseOrderId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
    },
  });
}
