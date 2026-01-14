"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createDiscount,
  updateDiscount,
  deleteDiscount,
  toggleDiscountActive,
  createBulkDiscounts,
  validateDiscountCode,
  type CreateDiscountInput,
  type UpdateDiscountInput,
} from "@/lib/actions/commerce/discounts";

// Types
export interface Discount {
  id: string;
  spaceId: string;
  code: string;
  name: string;
  description: string | null;
  type: "percentage" | "fixed_amount";
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  appliesTo: string[];
  createdAt: string;
  updatedAt: string;
  status: "active" | "scheduled" | "expired" | "disabled" | "exhausted";
}

export interface DiscountUsage {
  id: string;
  discountId: string;
  customerId: string;
  orderId: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface DiscountOrder {
  id: string;
  orderNumber: string;
  total: number;
  discount: number;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
  } | null;
}

export interface DiscountDetail extends Discount {
  usages: DiscountUsage[];
}

export interface DiscountDetailResponse {
  discount: DiscountDetail;
  orders: DiscountOrder[];
}

export interface DiscountsResponse {
  discounts: Discount[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface DiscountFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchDiscounts(
  spaceId: string,
  filters: DiscountFilters
): Promise<DiscountsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.isActive !== undefined) params.set("isActive", String(filters.isActive));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/discounts?${params}`);
  if (!response.ok) throw new Error("Failed to fetch discounts");
  const json = await response.json();
  return json.data;
}

async function fetchDiscountDetail(
  spaceId: string,
  discountId: string
): Promise<DiscountDetailResponse> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/discounts/${discountId}?${params}`);
  if (!response.ok) throw new Error("Failed to fetch discount details");
  const json = await response.json();
  return json.data;
}

// Query hooks
export function useDiscounts(spaceId: string, filters: DiscountFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.discounts.list(spaceId, filters),
    queryFn: () => fetchDiscounts(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useDiscountDetail(spaceId: string, discountId: string | null) {
  return useQuery({
    queryKey: queryKeys.commerce.discounts.detail(spaceId, discountId || ""),
    queryFn: () => fetchDiscountDetail(spaceId, discountId!),
    enabled: !!spaceId && !!discountId,
  });
}

// Mutation hooks
export function useCreateDiscount(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDiscountInput) => createDiscount(spaceId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useCreateBulkDiscounts(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      count,
      templateInput,
      prefix,
    }: {
      count: number;
      templateInput: Omit<CreateDiscountInput, "code">;
      prefix?: string;
    }) => createBulkDiscounts(spaceId, count, templateInput, prefix),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useUpdateDiscount(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      discountId,
      input,
    }: {
      discountId: string;
      input: UpdateDiscountInput;
    }) => updateDiscount(spaceId, discountId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useToggleDiscount(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      discountId,
      isActive,
    }: {
      discountId: string;
      isActive: boolean;
    }) => toggleDiscountActive(spaceId, discountId, isActive),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useDeleteDiscount(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (discountId: string) => deleteDiscount(spaceId, discountId),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useValidateDiscount(spaceId: string) {
  return useMutation({
    mutationFn: ({
      code,
      orderTotal,
      customerId,
      productIds,
    }: {
      code: string;
      orderTotal: number;
      customerId?: string;
      productIds?: string[];
    }) => validateDiscountCode(spaceId, code, orderTotal, customerId, productIds),
  });
}
