"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createOrder,
  updateOrderStatus,
  deleteOrder,
  type CreateOrderInput,
} from "@/lib/actions/commerce/orders";

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
  source: "walk_in" | "storefront" | "manual";
  paymentMethod: "cash" | "card" | "transfer" | "pos" | "other" | null;
  status: "pending" | "confirmed" | "processing" | "completed" | "cancelled" | "refunded";
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  totalCost: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  items: OrderItem[];
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
async function fetchOrders(
  spaceId: string,
  filters: OrderFilters
): Promise<OrdersResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  if (filters.source && filters.source !== "all")
    params.set("source", filters.source);
  if (filters.customerId) params.set("customerId", filters.customerId);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/orders?${params}`);
  if (!response.ok) throw new Error("Failed to fetch orders");
  return response.json();
}

async function fetchOrder(
  spaceId: string,
  orderId: string
): Promise<{ order: Order }> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/orders/${orderId}?${params}`);
  if (!response.ok) throw new Error("Failed to fetch order");
  return response.json();
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

// Mutation hooks with optimistic updates
export function useCreateOrder(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(spaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.orders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.inventory.all,
      });
    },
  });
}

export function useUpdateOrderStatus(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      updateOrderStatus(spaceId, orderId, status),
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.orders.detail(spaceId, orderId),
      });

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

      // Also update in list
      const previousOrders = queryClient.getQueryData<OrdersResponse>(
        queryKeys.commerce.orders.list(spaceId, {})
      );

      if (previousOrders) {
        queryClient.setQueryData<OrdersResponse>(
          queryKeys.commerce.orders.list(spaceId, {}),
          {
            ...previousOrders,
            orders: previousOrders.orders.map((o) =>
              o.id === orderId ? { ...o, status: status as Order["status"] } : o
            ),
          }
        );
      }

      return { previousOrder, previousOrders };
    },
    onError: (err, { orderId }, context) => {
      if (context?.previousOrder) {
        queryClient.setQueryData(
          queryKeys.commerce.orders.detail(spaceId, orderId),
          context.previousOrder
        );
      }
      if (context?.previousOrders) {
        queryClient.setQueryData(
          queryKeys.commerce.orders.list(spaceId, {}),
          context.previousOrders
        );
      }
    },
    onSettled: (data, error, { orderId }) => {
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
    mutationFn: (orderId: string) => deleteOrder(spaceId, orderId),
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.orders.all,
      });

      const previousOrders = queryClient.getQueryData<OrdersResponse>(
        queryKeys.commerce.orders.list(spaceId, {})
      );

      if (previousOrders) {
        queryClient.setQueryData<OrdersResponse>(
          queryKeys.commerce.orders.list(spaceId, {}),
          {
            ...previousOrders,
            orders: previousOrders.orders.filter((o) => o.id !== orderId),
            pagination: {
              ...previousOrders.pagination,
              total: previousOrders.pagination.total - 1,
            },
          }
        );
      }

      return { previousOrders };
    },
    onError: (err, orderId, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(
          queryKeys.commerce.orders.list(spaceId, {}),
          context.previousOrders
        );
      }
    },
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
