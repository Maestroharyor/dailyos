"use client";

import type { PurchaseOrderStatus } from "@prisma/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  type CreatePurchaseOrderInput,
  createPurchaseOrder,
  deletePurchaseOrder,
  listPurchaseOrders,
  type ReceiveItemsInput,
  receiveItems,
  updatePurchaseOrderStatus,
} from "@/lib/actions/commerce/purchaseOrders";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";
import { patchLists, restoreLists } from "../optimistic";

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
  filters: PurchaseOrderFilters,
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
/**
 * Deliberately not optimistic.
 *
 * A purchase order is identified by an `orderNumber` the server generates, and
 * its lines carry the product name, SKU and running total the hook has no way
 * to resolve from the ids it was handed. A placeholder row would be a blank
 * reference beside prices that are a guess, on a document a merchant sends to
 * a supplier. Waiting for the real row is the smaller cost.
 */
export function useCreatePurchaseOrder(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreatePurchaseOrderInput) =>
      createPurchaseOrder(spaceId, input),
    ),
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
    mutationFn: wrapAction(
      ({ purchaseOrderId, status }: { purchaseOrderId: string; status: PurchaseOrderStatus }) =>
        updatePurchaseOrderStatus(spaceId, purchaseOrderId, status),
    ),
    onMutate: async ({ purchaseOrderId, status }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });

      // The `stats` block is a per-status roll-up. Moving one order between
      // buckets here would mean re-deriving totals the server already returns,
      // so it is left to the invalidate; the row itself is what the merchant
      // is looking at.
      const previous = patchLists<PurchaseOrdersResponse>(
        queryClient,
        queryKeys.commerce.purchaseOrders.lists(spaceId),
        (data) => ({
          ...data,
          purchaseOrders: data.purchaseOrders.map((po) =>
            po.id === purchaseOrderId ? { ...po, status } : po,
          ),
        }),
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Purchase order updated"),
    onError: (err, variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update purchase order");
    },
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
    mutationFn: wrapAction(
      ({ purchaseOrderId, input }: { purchaseOrderId: string; input: ReceiveItemsInput }) =>
        receiveItems(spaceId, purchaseOrderId, input),
    ),
    // Not optimistic on purpose: whether a receipt leaves the order partial or
    // fully received depends on every line's outstanding quantity, and the
    // resulting stock movements are the server's to write. Guessing at the
    // status here would be a second implementation of that rule, in the place
    // where getting it wrong shows a delivery as complete that is not.
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
    mutationFn: wrapAction((purchaseOrderId: string) =>
      deletePurchaseOrder(spaceId, purchaseOrderId),
    ),
    onMutate: async (purchaseOrderId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });

      const previous = patchLists<PurchaseOrdersResponse>(
        queryClient,
        queryKeys.commerce.purchaseOrders.lists(spaceId),
        (data) => {
          const purchaseOrders = data.purchaseOrders.filter((po) => po.id !== purchaseOrderId);
          if (purchaseOrders.length === data.purchaseOrders.length) return data;
          return {
            ...data,
            purchaseOrders,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        },
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Purchase order deleted"),
    onError: (err, purchaseOrderId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't delete purchase order");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.purchaseOrders.all,
      });
    },
  });
}
