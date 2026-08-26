"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { patchFirstPages, patchLists, restoreLists } from "../optimistic";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  type CreateSupplierInput,
  type UpdateSupplierInput,
} from "@/lib/actions/commerce/suppliers";

// Types
export interface Supplier {
  id: string;
  spaceId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  paymentTerms: string | null;
  leadTimeDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number; purchaseOrders: number };
}

export interface SuppliersResponse {
  suppliers: Supplier[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SupplierFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchSuppliers(
  spaceId: string,
  filters: SupplierFilters
): Promise<SuppliersResponse> {
  return unwrapAction(listSuppliers(spaceId, filters));
}

// Query hooks
export function useSuppliers(spaceId: string, filters: SupplierFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.suppliers.list(spaceId, filters),
    queryFn: () => fetchSuppliers(spaceId, filters),
    enabled: !!spaceId,
  });
}

// Mutation hooks
//
// None of these had an `onMutate` until now, so every supplier change sat
// still until the server answered — the thing CLAUDE.md requires and the
// thing the outbox makes unworkable, since the reconciling invalidate never
// resolves while the device is offline.
export function useCreateSupplier(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateSupplierInput) => createSupplier(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });

      const now = new Date().toISOString();
      const optimistic: Supplier = {
        id: `temp-${Date.now()}`,
        spaceId,
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        paymentTerms: input.paymentTerms ?? null,
        leadTimeDays: input.leadTimeDays,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
        _count: { products: 0, purchaseOrders: 0 },
      };

      const previous = patchFirstPages<SuppliersResponse>(
        queryClient,
        queryKeys.commerce.suppliers.lists(spaceId),
        (data) => ({
          ...data,
          suppliers: [optimistic, ...data.suppliers],
          pagination: { ...data.pagination, total: data.pagination.total + 1 },
        })
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Supplier added"),
    onError: (err, input, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't create supplier");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });
    },
  });
}

export function useUpdateSupplier(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      supplierId,
      input,
    }: {
      supplierId: string;
      input: UpdateSupplierInput;
    }) => updateSupplier(spaceId, supplierId, input)),
    onMutate: async ({ supplierId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });

      const updatedAt = new Date().toISOString();
      const previous = patchLists<SuppliersResponse>(
        queryClient,
        queryKeys.commerce.suppliers.lists(spaceId),
        (data) => ({
          ...data,
          suppliers: data.suppliers.map((s) =>
            s.id === supplierId ? { ...s, ...input, updatedAt } : s
          ),
        })
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Supplier updated"),
    onError: (err, variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update supplier");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });
    },
  });
}

export function useDeleteSupplier(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((supplierId: string) => deleteSupplier(spaceId, supplierId)),
    onMutate: async (supplierId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });

      const previous = patchLists<SuppliersResponse>(
        queryClient,
        queryKeys.commerce.suppliers.lists(spaceId),
        (data) => {
          const suppliers = data.suppliers.filter((s) => s.id !== supplierId);
          if (suppliers.length === data.suppliers.length) return data;
          return {
            ...data,
            suppliers,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        }
      );

      return { previous };
    },
    onSuccess: () => notifySuccess("Supplier deleted"),
    onError: (err, supplierId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't delete supplier");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });
    },
  });
}
