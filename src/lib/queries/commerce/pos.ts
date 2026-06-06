"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { unwrapAction } from "@/lib/action-mutation";
import { getPOSProducts, getPOSContext } from "@/lib/actions/commerce/pos";
import { queryKeys } from "../keys";

// Types
export interface POSProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
}

export interface POSProduct {
  id: string;
  spaceId: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  status: string;
  isPublished: boolean;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    isPrimary: boolean;
  }>;
  variants: POSProductVariant[];
  stock: number;
  totalStock: number;
}

export interface POSCategory {
  id: string;
  name: string;
  slug: string;
}

export interface POSCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface POSPaymentMethod {
  id: string;
  name: string;
  isActive: boolean;
}

export interface POSSettings {
  id: string;
  spaceId: string;
  currency: string;
  taxRate: number;
  lowStockThreshold: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  paymentMethods: POSPaymentMethod[];
}

export interface POSProductsPage {
  products: POSProduct[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface POSContext {
  categories: POSCategory[];
  customers: POSCustomer[];
  settings: POSSettings;
}

export interface POSProductFilters {
  search?: string;
  categoryId?: string;
}

// 48 divides evenly into the grid's 2/3/4-column layouts, so every full page
// renders complete rows.
const POS_PAGE_SIZE = 48;

// Infinite product grid: filters live in the queryKey, so changing search or
// category resets to page 1 automatically.
export function usePOSProducts(spaceId: string, filters: POSProductFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.commerce.pos.products(spaceId, filters),
    queryFn: async ({ pageParam }) =>
      unwrapAction(
        getPOSProducts(spaceId, {
          ...filters,
          page: pageParam,
          limit: POS_PAGE_SIZE,
        })
      ) as Promise<POSProductsPage>,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    // Keep the previous results rendered while a new filter's first page
    // loads — avoids a skeleton flash on every search keystroke.
    placeholderData: (prev) => prev,
    enabled: !!spaceId,
    staleTime: 30 * 1000, // POS stock should be relatively fresh
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true, // refetch on focus for stock updates
  });
}

// Static context (categories, customers, settings) fetched once per space.
export function usePOSContext(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.pos.context(spaceId),
    queryFn: async () => unwrapAction(getPOSContext(spaceId)) as Promise<POSContext>,
    enabled: !!spaceId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
