"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
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
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.isActive !== undefined) params.set("isActive", String(filters.isActive));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/suppliers?${params}`);
  if (!response.ok) throw new Error("Failed to fetch suppliers");
  const json = await response.json();
  return json.data;
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
    mutationFn: (input: CreateSupplierInput) => createSupplier(spaceId, input),
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
    mutationFn: ({
      supplierId,
      input,
    }: {
      supplierId: string;
      input: UpdateSupplierInput;
    }) => updateSupplier(spaceId, supplierId, input),
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
    mutationFn: (supplierId: string) => deleteSupplier(spaceId, supplierId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.suppliers.all,
      });
    },
  });
}
