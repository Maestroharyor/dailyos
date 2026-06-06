"use client";

import { useQuery } from "@tanstack/react-query";
import { unwrapAction } from "@/lib/action-mutation";
import { getPOSData } from "@/lib/actions/commerce/pos";

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

export interface POSData {
  products: POSProduct[];
  categories: POSCategory[];
  customers: POSCustomer[];
  settings: POSSettings;
}

// Fetch function
async function fetchPOSData(spaceId: string): Promise<POSData> {
  return unwrapAction(getPOSData(spaceId)) as Promise<POSData>;
}

// Query hook
export function usePOSData(spaceId: string) {
  return useQuery({
    queryKey: ["commerce", "pos", spaceId],
    queryFn: () => fetchPOSData(spaceId),
    enabled: !!spaceId,
    staleTime: 30 * 1000, // 30 seconds - POS data should be relatively fresh
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true, // Refetch on window focus for stock updates
  });
}
