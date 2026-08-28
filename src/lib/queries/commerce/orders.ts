"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import type { ActionResponse } from "@/lib/action-response";
import {
  type CreateOrderInput,
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  updateOrderStatus,
} from "@/lib/actions/commerce/orders";
import type { OrderStatus } from "@/lib/commerce/order-status";
import { provisionalOrderNumber } from "@/lib/offline/order-number";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";
import { patchLists, restoreLists } from "../optimistic";

// Types
export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
  product?: {
    id: string;
    name: string;
    images: Array<{ url: string }>;
  };
  variant?: { id: string; name: string } | null;
}

export interface Order {
  id: string;
  spaceId: string;
  orderNumber: string;
  customerId: string | null;
  source: "walk_in" | "pos" | "storefront" | "manual";
  paymentMethod: "cash" | "card" | "transfer" | "pos" | "other" | null;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  discount: number;
  discountCode?: string | null;
  total: number;
  totalCost: number;
  /** The shopper's delivery instructions. Nothing else goes in here. */
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Where this order was sent, snapshotted at creation. Null on older orders. */
  shippingName?: string | null;
  shippingAddress?: string | null;
  shippingPhone?: string | null;
  paymentReference?: string | null;
  paymentTransactionId?: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address?: string | null;
    avatarUrl?: string | null;
  } | null;
  items: OrderItem[];
  /** Ascending. Absent on list reads, which do not load it. */
  statusHistory?: Array<{ status: OrderStatus; note: string | null; createdAt: string }>;
  profit?: number;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface OrderFilters {
  search?: string;
  status?: string;
  source?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchOrders(spaceId: string, filters: OrderFilters): Promise<OrdersResponse> {
  return unwrapAction(listOrders(spaceId, filters));
}

async function fetchOrder(spaceId: string, orderId: string): Promise<{ order: Order }> {
  return unwrapAction(getOrder(spaceId, orderId));
}

// Query hooks
export function useOrders(spaceId: string, filters: OrderFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.orders.list(spaceId, filters),
    queryFn: () => fetchOrders(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useOrdersSuspense(spaceId: string, filters: OrderFilters = {}) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.orders.list(spaceId, filters),
    queryFn: () => fetchOrders(spaceId, filters),
  });
}

export function useOrder(spaceId: string, orderId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.orders.detail(spaceId, orderId),
    queryFn: () => fetchOrder(spaceId, orderId),
    enabled: !!spaceId && !!orderId,
  });
}

export function useOrderSuspense(spaceId: string, orderId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.orders.detail(spaceId, orderId),
    queryFn: () => fetchOrder(spaceId, orderId),
  });
}

/**
 * The order a receipt prints from when the sale was queued rather than sent.
 *
 * Shaped like a real one because the POS reads it synchronously to build the
 * receipt. The two giveaways are deliberate: the order number is an `OFF-`
 * provisional reference rather than an `ORD-` one, and the id is the request
 * id rather than a server id, so nothing downstream mistakes it for a row.
 */
function queuedOrderResult(
  spaceId: string,
  input: CreateOrderInput,
  requestId: string
): ActionResponse<Order> {
  const now = new Date().toISOString();
  const totals = {
    subtotal: input.subtotal,
    tax: input.tax ?? 0,
    discount: input.discount ?? 0,
  };
  const totalCost = input.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

  const order: Order = {
    id: requestId,
    spaceId,
    orderNumber: provisionalOrderNumber(requestId),
    customerId: input.customerId ?? null,
    source: input.source ?? "pos",
    paymentMethod: input.paymentMethod ?? null,
    status: input.status ?? "pending",
    subtotal: totals.subtotal,
    tax: totals.tax,
    discount: totals.discount,
    discountCode: input.discountCode ?? null,
    // Deliberately the client's arithmetic: the server has not priced this
    // yet, and the receipt has to say what the customer was charged. The
    // figures are reconciled when the sale syncs.
    total: totals.subtotal + totals.tax - totals.discount,
    totalCost,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    customer: null,
    items: input.items.map((item, index) => ({
      id: `${requestId}-${index}`,
      productId: item.productId,
      variantId: item.variantId ?? null,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      total: item.unitPrice * item.quantity,
    })),
  };

  return { success: true, message: "Sale queued", data: order };
}

// Mutation hooks with optimistic updates
export function useCreateOrder(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // The one write that must never be lost. Offline it goes to the outbox and
  // comes back with a provisional OFF- reference the receipt can print; the
  // server assigns the real ORD- number when it syncs.
  return useOfflineMutation<CreateOrderInput, ActionResponse<Order>>({
    mutationFn: wrapAction((input: CreateOrderInput) => createOrder(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "order",
    action: "create",
    // The POS already mints one per attempt; honour it so a sale that failed
    // online and then queued keeps a single identity end to end.
    // The POS mints one key per sale, and it is what the receipt's OFF-
    // reference is derived from. Reuse it as the outbox record's id so the
    // reference on the paper and the reference on the sync screen are the
    // same string.
    requestIdOf: (input) => input.clientRequestId,
    toPayload: (input, requestId) => ({
      ...input,
      clientRequestId: input.clientRequestId ?? requestId,
    }),
    toLocalResult: (input, requestId) =>
      queuedOrderResult(spaceId, input, input.clientRequestId ?? requestId),
    onSuccess: () => {
      notifySuccess("Order created");
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.orders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
      // POS grid stock comes from its own queries, refresh them after a
      // sale. Use the pos.all prefix: pos.products(spaceId) without filters
      // would carry a trailing `undefined` that partialMatchKey never matches.
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.pos.all,
      });
    },
    onError: (err) => notifyError(err, "Couldn't create order"),
  });
}

export function useUpdateOrderStatus(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({ orderId, status }: { orderId: string; status: string }) =>
      updateOrderStatus(spaceId, orderId, status)
    ),
    onMutate: async ({ orderId, status }) => {
      // Both keys, see the note in useUpdateProduct.
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.orders.detail(spaceId, orderId),
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.orders.lists(spaceId),
        }),
      ]);

      const previousOrder = queryClient.getQueryData<{ order: Order }>(
        queryKeys.commerce.orders.detail(spaceId, orderId)
      );

      if (previousOrder) {
        queryClient.setQueryData<{ order: Order }>(
          queryKeys.commerce.orders.detail(spaceId, orderId),
          {
            order: { ...previousOrder.order, status: status as Order["status"] },
          }
        );
      }

      // And in every cached page of the list, not only the unfiltered one:
      // an order is most often marked fulfilled from a list filtered to
      // pending, which is precisely the page the old key did not cover.
      const previous = patchLists<OrdersResponse>(
        queryClient,
        queryKeys.commerce.orders.lists(spaceId),
        (data) => ({
          ...data,
          orders: data.orders.map((o) =>
            o.id === orderId ? { ...o, status: status as Order["status"] } : o
          ),
        })
      );

      return { previousOrder, previous };
    },
    onError: (err, { orderId }, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(
          queryKeys.commerce.orders.detail(spaceId, orderId),
          context.previousOrder
        );
      }
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update order status");
    },
    onSuccess: () => notifySuccess("Order status updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.orders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}

export function useDeleteOrder(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((orderId: string) => deleteOrder(spaceId, orderId)),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.orders.all,
      });

      const previous = patchLists<OrdersResponse>(
        queryClient,
        queryKeys.commerce.orders.lists(spaceId),
        (data) => {
          const orders = data.orders.filter((o) => o.id !== orderId);
          if (orders.length === data.orders.length) return data;
          return {
            ...data,
            orders,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        }
      );

      return { previous };
    },
    onError: (err, _orderId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't delete order");
    },
    onSuccess: () => notifySuccess("Order deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.orders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}
