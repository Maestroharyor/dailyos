"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
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
export function useCreateSupplier(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateSupplierInput) => createSupplier(spaceId, input)),
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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });
    },
  });
}
