"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  patchFirstPages,
  patchLists,
  restoreLists,
  type ListSnapshot,
} from "../optimistic";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import type { ActionResponse } from "@/lib/action-response";
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomers,
  getCustomer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from "@/lib/actions/commerce/customers";

// Types
export interface Customer {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { orders: number };
  orders?: Array<{
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    createdAt: string;
  }>;
  stats?: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
  };
}

export interface CustomersResponse {
  customers: Customer[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CustomerFilters {
  search?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchCustomers(
  spaceId: string,
  filters: CustomerFilters
): Promise<CustomersResponse> {
  return unwrapAction(listCustomers(spaceId, filters));
}

async function fetchCustomer(
  spaceId: string,
  customerId: string
): Promise<{ customer: Customer }> {
  return unwrapAction(getCustomer(spaceId, customerId));
}

// Query hooks
export function useCustomers(spaceId: string, filters: CustomerFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.customers.list(spaceId, filters),
    queryFn: () => fetchCustomers(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useCustomersSuspense(
  spaceId: string,
  filters: CustomerFilters = {}
) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.customers.list(spaceId, filters),
    queryFn: () => fetchCustomers(spaceId, filters),
  });
}

export function useCustomer(spaceId: string, customerId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.customers.detail(spaceId, customerId),
    queryFn: () => fetchCustomer(spaceId, customerId),
    enabled: !!spaceId && !!customerId,
  });
}

export function useCustomerSuspense(spaceId: string, customerId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.customers.detail(spaceId, customerId),
    queryFn: () => fetchCustomer(spaceId, customerId),
  });
}

// Mutation hooks
export function useCreateCustomer(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Queues rather than fails when the network is gone. A customer created
  // offline is usually the first half of a sale, so the placeholder id it
  // returns is what the queued order points at until the create syncs.
  return useOfflineMutation<
    CreateCustomerInput,
    ActionResponse<Customer>,
    { previous: ListSnapshot<CustomersResponse> }
  >({
    mutationFn: wrapAction((input: CreateCustomerInput) => createCustomer(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "customer",
    action: "create",
    createsEntity: true,
    toPayload: (input, requestId) => ({ ...input, clientRequestId: requestId }),
    toLocalResult: (input, _requestId, placeholder) => {
      const now = new Date().toISOString();
      const queued: Customer = {
        id: placeholder,
        spaceId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
        _count: { orders: 0 },
      };
      return { success: true, message: "Customer queued", data: queued };
    },
    onMutate: async (newCustomer) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.customers.all,
      });

      const now = new Date().toISOString();
      // Built field by field rather than spread-and-cast: CreateCustomerInput
      // carries a clientRequestId that is not part of a Customer, and a cast
      // would have quietly put it in the cache.
      const optimisticCustomer: Customer = {
        id: `temp-${Date.now()}`,
        spaceId,
        name: newCustomer.name,
        email: newCustomer.email ?? null,
        phone: newCustomer.phone ?? null,
        address: newCustomer.address ?? null,
        notes: newCustomer.notes ?? null,
        createdAt: now,
        updatedAt: now,
        _count: { orders: 0 },
      };

      const previous = patchFirstPages<CustomersResponse>(
        queryClient,
        queryKeys.commerce.customers.lists(spaceId),
        (data) => ({
          ...data,
          customers: [optimisticCustomer, ...data.customers],
          pagination: { ...data.pagination, total: data.pagination.total + 1 },
        })
      );

      return { previous };
    },
    onError: (err, newCustomer, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't add customer");
    },
    onSuccess: () => notifySuccess("Customer added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
      });
      // POS reads customers from its own context query — refresh it so a
      // customer created from the POS modal appears in the dropdown.
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.pos.context(spaceId),
      });
    },
  });
}

export function useUpdateCustomer(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      customerId,
      input,
    }: {
      customerId: string;
      input: UpdateCustomerInput;
    }) => updateCustomer(spaceId, customerId, input)),
    onMutate: async ({ customerId, input }) => {
      // Both keys — see the note in useUpdateProduct.
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.customers.detail(spaceId, customerId),
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.customers.lists(spaceId),
        }),
      ]);

      const previousCustomer = queryClient.getQueryData<{ customer: Customer }>(
        queryKeys.commerce.customers.detail(spaceId, customerId)
      );

      if (previousCustomer) {
        queryClient.setQueryData<{ customer: Customer }>(
          queryKeys.commerce.customers.detail(spaceId, customerId),
          {
            customer: { ...previousCustomer.customer, ...input },
          }
        );
      }

      const previous = patchLists<CustomersResponse>(
        queryClient,
        queryKeys.commerce.customers.lists(spaceId),
        (data) => ({
          ...data,
          customers: data.customers.map((c) =>
            c.id === customerId ? { ...c, ...input } : c
          ),
        })
      );

      return { previousCustomer, previous };
    },
    onError: (err, { customerId }, context) => {
      if (context?.previousCustomer) {
        queryClient.setQueryData(
          queryKeys.commerce.customers.detail(spaceId, customerId),
          context.previousCustomer
        );
      }
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update customer");
    },
    onSuccess: () => notifySuccess("Customer updated"),
    onSettled: (data, error, { customerId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.detail(spaceId, customerId),
      });
    },
  });
}

export function useDeleteCustomer(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((customerId: string) => deleteCustomer(spaceId, customerId)),
    onMutate: async (customerId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.customers.all,
      });

      const previous = patchLists<CustomersResponse>(
        queryClient,
        queryKeys.commerce.customers.lists(spaceId),
        (data) => {
          const customers = data.customers.filter((c) => c.id !== customerId);
          if (customers.length === data.customers.length) return data;
          return {
            ...data,
            customers,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        }
      );

      return { previous };
    },
    onError: (err, customerId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't delete customer");
    },
    onSuccess: () => notifySuccess("Customer deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
      });
    },
  });
}
