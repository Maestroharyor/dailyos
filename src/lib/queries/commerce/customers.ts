"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
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

  return useMutation({
    mutationFn: wrapAction((input: CreateCustomerInput) => createCustomer(spaceId, input)),
    onMutate: async (newCustomer) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.customers.all,
      });

      const previousCustomers = queryClient.getQueryData<CustomersResponse>(
        queryKeys.commerce.customers.list(spaceId, {})
      );

      if (previousCustomers) {
        queryClient.setQueryData<CustomersResponse>(
          queryKeys.commerce.customers.list(spaceId, {}),
          {
            ...previousCustomers,
            customers: [
              {
                id: `temp-${Date.now()}`,
                spaceId,
                ...newCustomer,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                _count: { orders: 0 },
              } as Customer,
              ...previousCustomers.customers,
            ],
            pagination: {
              ...previousCustomers.pagination,
              total: previousCustomers.pagination.total + 1,
            },
          }
        );
      }

      return { previousCustomers };
    },
    onError: (err, newCustomer, context) => {
      if (context?.previousCustomers) {
        queryClient.setQueryData(
          queryKeys.commerce.customers.list(spaceId, {}),
          context.previousCustomers
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
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
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.customers.detail(spaceId, customerId),
      });

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

      return { previousCustomer };
    },
    onError: (err, { customerId }, context) => {
      if (context?.previousCustomer) {
        queryClient.setQueryData(
          queryKeys.commerce.customers.detail(spaceId, customerId),
          context.previousCustomer
        );
      }
    },
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

      const previousCustomers = queryClient.getQueryData<CustomersResponse>(
        queryKeys.commerce.customers.list(spaceId, {})
      );

      if (previousCustomers) {
        queryClient.setQueryData<CustomersResponse>(
          queryKeys.commerce.customers.list(spaceId, {}),
          {
            ...previousCustomers,
            customers: previousCustomers.customers.filter(
              (c) => c.id !== customerId
            ),
            pagination: {
              ...previousCustomers.pagination,
              total: previousCustomers.pagination.total - 1,
            },
          }
        );
      }

      return { previousCustomers };
    },
    onError: (err, customerId, context) => {
      if (context?.previousCustomers) {
        queryClient.setQueryData(
          queryKeys.commerce.customers.list(spaceId, {}),
          context.previousCustomers
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
      });
    },
  });
}
