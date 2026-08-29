"use client";

import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import type { ActionResponse } from "@/lib/action-response";
import {
  type CreateCustomerInput,
  createCustomer,
  deleteCustomer,
  getCustomer,
  listCustomers,
  type UpdateCustomerInput,
  updateCustomer,
} from "@/lib/actions/commerce/customers";
import { type EmailVerification, emailChanged } from "@/lib/commerce/customer-verification";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";
import { type ListSnapshot, patchFirstPages, patchLists, restoreLists } from "../optimistic";

// Types
export interface Customer {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  /**
   * The shopper's Google/Supabase profile picture, copied at order time.
   *
   * The column has existed since order branding shipped and serializeCustomer
   * spreads every Prisma column, so this has been crossing the wire the whole
   * time; only this hand-written interface hid it, which is why the list drew a
   * letter in a circle instead.
   */
  avatarUrl: string | null;
  /**
   * Derived from Customer.emailVerifiedAt; see lib/commerce/customer-verification
   * for why the stamp is ours rather than auth.users.email_confirmed_at.
   *
   * Optional because an optimistic cache row has not been through the server
   * yet. Absent means "nobody has evaluated this", not "the address failed" -
   * render nothing for it.
   */
  emailVerification?: EmailVerification;
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
    /** Absent on the list, which does not need it; present on the detail page. */
    averageOrderValue?: number;
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

async function fetchCustomer(spaceId: string, customerId: string): Promise<{ customer: Customer }> {
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

export function useCustomersSuspense(spaceId: string, filters: CustomerFilters = {}) {
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
        avatarUrl: null,
        createdAt: now,
        updatedAt: now,
        _count: { orders: 0 },
      };
      return { success: true, message: "Customer queued", data: queued };
    },
    // `placeholder` rather than a temp id of our own. A sale attached to a
    // customer picked out of this list carries whatever id is written here,
    // and only a `local-` one is visible to the outbox's dependency ordering
    // and id rewriting.
    onMutate: async (newCustomer, placeholder) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.customers.all,
      });

      const now = new Date().toISOString();
      // Built field by field rather than spread-and-cast: CreateCustomerInput
      // carries a clientRequestId that is not part of a Customer, and a cast
      // would have quietly put it in the cache.
      const optimisticCustomer: Customer = {
        id: placeholder,
        spaceId,
        name: newCustomer.name,
        email: newCustomer.email ?? null,
        phone: newCustomer.phone ?? null,
        address: newCustomer.address ?? null,
        notes: newCustomer.notes ?? null,
        // A customer created from the dashboard has no auth identity to copy a
        // picture from; the orders route fills it if they later shop online.
        avatarUrl: null,
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
    onError: (err, _newCustomer, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't add customer");
    },
    onSuccess: () => notifySuccess("Customer added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.customers.all,
      });
      // POS reads customers from its own context query, refresh it so a
      // customer created from the POS modal appears in the dropdown.
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.pos.context(spaceId),
      });
    },
  });
}

/**
 * Merge an edit into a cached customer row for the optimistic window.
 *
 * The reason this is not a plain spread: `input` carries no `emailVerification`,
 * so spreading it leaves the old value in place, and editing someone's address
 * would go on showing "verified" for the length of a round trip. The server
 * clears the stamp whenever the address moves - see `resolveEmailChange` in
 * actions/commerce/customers - so the cache would be contradicting it, and
 * showing a verified badge for an address nobody has proved is the exact
 * over-reporting this column was added to stop. A round trip is short, but it is
 * the wrong answer for the whole of it.
 *
 * Cleared to `undefined` rather than guessed at: absent means "nobody has
 * evaluated this row", which renders no badge at all, and that is honest for a
 * row the server has not answered for yet.
 *
 * Uses the same `emailChanged` the server does, so the two cannot disagree
 * about what counts as a different address - re-saving a form without touching
 * the email must not blank the badge either.
 */
export function mergeCustomerEdit(existing: Customer, input: UpdateCustomerInput): Customer {
  const merged = { ...existing, ...input };
  if (input.email !== undefined && emailChanged(existing.email, input.email)) {
    merged.emailVerification = undefined;
  }
  return merged;
}

export function useUpdateCustomer(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(
      ({ customerId, input }: { customerId: string; input: UpdateCustomerInput }) =>
        updateCustomer(spaceId, customerId, input)
    ),
    onMutate: async ({ customerId, input }) => {
      // Both keys, see the note in useUpdateProduct.
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
            customer: mergeCustomerEdit(previousCustomer.customer, input),
          }
        );
      }

      const previous = patchLists<CustomersResponse>(
        queryClient,
        queryKeys.commerce.customers.lists(spaceId),
        (data) => ({
          ...data,
          customers: data.customers.map((c) =>
            c.id === customerId ? mergeCustomerEdit(c, input) : c
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
    onSettled: (_data, _error, { customerId }) => {
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
    onError: (err, _customerId, context) => {
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
