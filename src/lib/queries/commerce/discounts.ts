"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import {
  listDiscounts,
  getDiscountDetail,
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
  return unwrapAction(listDiscounts(spaceId, filters));
}

async function fetchDiscountDetail(
  spaceId: string,
  discountId: string
): Promise<DiscountDetailResponse> {
  return unwrapAction(getDiscountDetail(spaceId, discountId));
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
// Optimistic writes use getQueriesData over the `lists(spaceId)` prefix so
// they hit the active filtered/paginated cache pages, not just `{}`.
export function useCreateDiscount(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateDiscountInput) => createDiscount(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });

      const previous = queryClient.getQueriesData<DiscountsResponse>({
        queryKey: queryKeys.commerce.discounts.lists(spaceId),
      });

      const optimisticDiscount: Discount = {
        id: `temp-${Date.now()}`,
        spaceId,
        // Server generates the code when omitted; placeholder until reconciled.
        code: input.code?.toUpperCase() ?? "GENERATING…",
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        value: input.value,
        minOrderAmount: input.minOrderAmount ?? null,
        maxDiscount: input.maxDiscount ?? null,
        usageLimit: input.usageLimit ?? null,
        usageCount: 0,
        perCustomerLimit: input.perCustomerLimit ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        isActive: input.isActive ?? true,
        appliesTo: input.appliesTo ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: (input.isActive ?? true) ? "active" : "disabled",
      };

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<DiscountsResponse>(queryKey, {
            ...data,
            discounts: [optimisticDiscount, ...data.discounts],
            pagination: {
              ...data.pagination,
              total: data.pagination.total + 1,
            },
          });
        }
      });

      return { previous };
    },
    onError: (err, input, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

// No optimistic insert here: bulk codes are generated server-side, and showing
// placeholder codes the user might copy would be misleading. Invalidate only.
export function useCreateBulkDiscounts(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      count,
      templateInput,
      prefix,
    }: {
      count: number;
      templateInput: Omit<CreateDiscountInput, "code">;
      prefix?: string;
    }) => createBulkDiscounts(spaceId, count, templateInput, prefix)),
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
    mutationFn: wrapAction(({
      discountId,
      input,
    }: {
      discountId: string;
      input: UpdateDiscountInput;
    }) => updateDiscount(spaceId, discountId, input)),
    onMutate: async ({ discountId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });

      const previous = queryClient.getQueriesData<DiscountsResponse>({
        queryKey: queryKeys.commerce.discounts.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<DiscountsResponse>(queryKey, {
            ...data,
            discounts: data.discounts.map((d) =>
              d.id === discountId ? { ...d, ...input } : d
            ),
          });
        }
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
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
    mutationFn: wrapAction(({
      discountId,
      isActive,
    }: {
      discountId: string;
      isActive: boolean;
    }) => toggleDiscountActive(spaceId, discountId, isActive)),
    onMutate: async ({ discountId, isActive }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });

      const previous = queryClient.getQueriesData<DiscountsResponse>({
        queryKey: queryKeys.commerce.discounts.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<DiscountsResponse>(queryKey, {
            ...data,
            discounts: data.discounts.map((d) =>
              d.id === discountId
                ? {
                    ...d,
                    isActive,
                    // Approximate; the server recomputes scheduled/expired/
                    // exhausted and onSettled reconciles.
                    status: isActive ? "active" : "disabled",
                  }
                : d
            ),
          });
        }
      });

      return { previous };
    },
    onError: (err, vars, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
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
    mutationFn: wrapAction((discountId: string) => deleteDiscount(spaceId, discountId)),
    onMutate: async (discountId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });

      const previous = queryClient.getQueriesData<DiscountsResponse>({
        queryKey: queryKeys.commerce.discounts.lists(spaceId),
      });

      previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<DiscountsResponse>(queryKey, {
            ...data,
            discounts: data.discounts.filter((d) => d.id !== discountId),
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          });
        }
      });

      return { previous };
    },
    onError: (err, discountId, context) => {
      context?.previous.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.discounts.all,
      });
    },
  });
}

export function useValidateDiscount(spaceId: string) {
  return useMutation({
    mutationFn: wrapAction(({
      code,
      orderTotal,
      customerId,
      productIds,
    }: {
      code: string;
      orderTotal: number;
      customerId?: string;
      productIds?: string[];
    }) => validateDiscountCode(spaceId, code, orderTotal, customerId, productIds)),
  });
}
