"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listSaleEvents,
  getSaleEventDetail,
  createSaleEvent,
  updateSaleEvent,
  deleteSaleEvent,
  toggleSaleEventActive,
  addProductsToSaleEvent,
  removeProductFromSaleEvent,
  updateSaleEventProduct,
  type CreateSaleEventInput,
  type UpdateSaleEventInput,
} from "@/lib/actions/commerce/sales";

// Types
export interface SaleEventProduct {
  id: string;
  productId: string;
  name: string;
  sku: string;
  originalPrice: number;
  effectiveSalePrice: number;
  overrideSalePrice: number | null;
  discountPercent: number;
  status: string;
  image: { url: string; alt: string | null } | null;
  addedAt: string;
}

export interface SaleEvent {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  bannerImage: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status: "draft" | "scheduled" | "active" | "ended";
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaleEventDetail extends Omit<SaleEvent, "productCount"> {
  products: SaleEventProduct[];
}

export interface SaleEventsResponse {
  saleEvents: SaleEvent[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SaleEventDetailResponse {
  saleEvent: SaleEventDetail;
}

export interface SaleEventFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchSaleEvents(
  spaceId: string,
  filters: SaleEventFilters
): Promise<SaleEventsResponse> {
  return unwrapAction(listSaleEvents(spaceId, filters)) as Promise<SaleEventsResponse>;
}

async function fetchSaleEventDetail(
  spaceId: string,
  eventId: string
): Promise<SaleEventDetailResponse> {
  return unwrapAction(
    getSaleEventDetail(spaceId, eventId)
  ) as Promise<SaleEventDetailResponse>;
}

// Query hooks
export function useSaleEvents(spaceId: string, filters: SaleEventFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.sales.list(spaceId, filters),
    queryFn: () => fetchSaleEvents(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useSaleEventDetail(
  spaceId: string,
  eventId: string | null
) {
  return useQuery({
    queryKey: queryKeys.commerce.sales.detail(spaceId, eventId || ""),
    queryFn: () => fetchSaleEventDetail(spaceId, eventId!),
    enabled: !!spaceId && !!eventId,
  });
}

// Mutation hooks
export function useCreateSaleEvent(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateSaleEventInput) =>
      createSaleEvent(spaceId, input)),
    onSuccess: () => notifySuccess("Sale event created"),
    onError: (err) => notifyError(err, "Couldn't create sale event"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useUpdateSaleEvent(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      eventId,
      input,
    }: {
      eventId: string;
      input: UpdateSaleEventInput;
    }) => updateSaleEvent(spaceId, eventId, input)),
    onSuccess: () => notifySuccess("Sale event updated"),
    onError: (err) => notifyError(err, "Couldn't update sale event"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useDeleteSaleEvent(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((eventId: string) => deleteSaleEvent(spaceId, eventId)),
    onSuccess: () => notifySuccess("Sale event deleted"),
    onError: (err) => notifyError(err, "Couldn't delete sale event"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useToggleSaleEvent(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      eventId,
      isActive,
    }: {
      eventId: string;
      isActive: boolean;
    }) => toggleSaleEventActive(spaceId, eventId, isActive)),
    onSuccess: () => notifySuccess("Sale event updated"),
    onError: (err) => notifyError(err, "Couldn't update sale event"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useAddProductsToSale(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      eventId,
      products,
    }: {
      eventId: string;
      products: { productId: string; salePrice?: number | null }[];
    }) => addProductsToSaleEvent(spaceId, eventId, products)),
    onSuccess: () => notifySuccess("Products added to sale"),
    onError: (err) => notifyError(err, "Couldn't add products to sale"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useRemoveProductFromSale(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      eventId,
      productId,
    }: {
      eventId: string;
      productId: string;
    }) => removeProductFromSaleEvent(spaceId, eventId, productId)),
    onSuccess: () => notifySuccess("Product removed from sale"),
    onError: (err) => notifyError(err, "Couldn't remove product from sale"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}

export function useUpdateSaleEventProduct(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      eventId,
      productId,
      salePrice,
    }: {
      eventId: string;
      productId: string;
      salePrice: number | null;
    }) => updateSaleEventProduct(spaceId, eventId, productId, salePrice)),
    onSuccess: () => notifySuccess("Sale price updated"),
    onError: (err) => notifyError(err, "Couldn't update sale price"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.sales.all,
      });
    },
  });
}
