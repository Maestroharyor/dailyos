"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listPurchaseOrders,
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
  const data = await unwrapAction(listPurchaseOrders(spaceId, filters));
  return data as unknown as PurchaseOrdersResponse;
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
    mutationFn: wrapAction((input: CreatePurchaseOrderInput) => createPurchaseOrder(spaceId, input)),
    onSuccess: () => notifySuccess("Purchase order created"),
    onError: (err) => notifyError(err, "Couldn't create purchase order"),
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
    mutationFn: wrapAction(({
      purchaseOrderId,
      status,
    }: {
      purchaseOrderId: string;
      status: PurchaseOrderStatus;
    }) => updatePurchaseOrderStatus(spaceId, purchaseOrderId, status)),
    onSuccess: () => notifySuccess("Purchase order updated"),
    onError: (err) => notifyError(err, "Couldn't update purchase order"),
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
    mutationFn: wrapAction(({
      purchaseOrderId,
      input,
    }: {
      purchaseOrderId: string;
      input: ReceiveItemsInput;
    }) => receiveItems(spaceId, purchaseOrderId, input)),
    onSuccess: () => notifySuccess("Purchase order received"),
    onError: (err) => notifyError(err, "Couldn't receive items"),
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
    mutationFn: wrapAction((purchaseOrderId: string) => deletePurchaseOrder(spaceId, purchaseOrderId)),
    onSuccess: () => notifySuccess("Purchase order deleted"),
    onError: (err) => notifyError(err, "Couldn't delete purchase order"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
    },
  });
}
