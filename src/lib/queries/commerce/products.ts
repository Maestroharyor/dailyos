"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductPublished,
  type CreateProductInput,
  type UpdateProductInput,
} from "@/lib/actions/commerce/products";

// Types
export interface Product {
  id: string;
  spaceId: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  salePrice: number | null;
  onSale: boolean;
  status: "draft" | "active" | "archived";
  isPublished: boolean;
  categoryId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    isPrimary: boolean;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    price: number;
    costPrice: number;
  }>;
  _count?: { inventoryItems: number };
  totalStock?: number;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchProducts(
  spaceId: string,
  filters: ProductFilters
): Promise<ProductsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters.search) params.set("search", filters.search);
  if (filters.categoryId && filters.categoryId !== "all")
    params.set("categoryId", filters.categoryId);
  if (filters.status && filters.status !== "all")
    params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  const response = await fetch(`/api/commerce/products?${params}`);
  if (!response.ok) throw new Error("Failed to fetch products");
  const json = await response.json();
  return json.data;
}

async function fetchProduct(
  spaceId: string,
  productId: string
): Promise<{ product: Product }> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/products/${productId}?${params}`);
  if (!response.ok) throw new Error("Failed to fetch product");
  const json = await response.json();
  return json.data;
}

// Query hooks
export function useProducts(spaceId: string, filters: ProductFilters = {}) {
  return useQuery({
    queryKey: queryKeys.commerce.products.list(spaceId, filters),
    queryFn: () => fetchProducts(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useProductsSuspense(
  spaceId: string,
  filters: ProductFilters = {}
) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.products.list(spaceId, filters),
    queryFn: () => fetchProducts(spaceId, filters),
  });
}

export function useProduct(spaceId: string, productId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.products.detail(spaceId, productId),
    queryFn: () => fetchProduct(spaceId, productId),
    enabled: !!spaceId && !!productId,
  });
}

export function useProductSuspense(spaceId: string, productId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.products.detail(spaceId, productId),
    queryFn: () => fetchProduct(spaceId, productId),
  });
}

// Mutation hooks with optimistic updates
export function useCreateProduct(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(spaceId, input),
    onMutate: async (newProduct) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const previousProducts = queryClient.getQueryData<ProductsResponse>(
        queryKeys.commerce.products.list(spaceId, {})
      );

      // Optimistically add the new product
      if (previousProducts) {
        const optimisticProduct: Product = {
          id: `temp-${Date.now()}`,
          spaceId,
          sku: newProduct.sku,
          name: newProduct.name,
          description: newProduct.description || null,
          price: newProduct.price,
          costPrice: newProduct.costPrice,
          salePrice: newProduct.salePrice || null,
          onSale: newProduct.onSale || false,
          status: newProduct.status || "draft",
          isPublished: newProduct.isPublished || false,
          categoryId: newProduct.categoryId || null,
          tags: newProduct.tags || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          category: null,
          images: (newProduct.images || []).map((img, i) => ({
            id: `temp-img-${i}`,
            url: img.url,
            alt: img.alt || null,
            isPrimary: img.isPrimary || false,
          })),
          variants: (newProduct.variants || []).map((v, i) => ({
            id: `temp-var-${i}`,
            sku: v.sku,
            name: v.name,
            price: v.price,
            costPrice: v.costPrice,
          })),
        };

        queryClient.setQueryData<ProductsResponse>(
          queryKeys.commerce.products.list(spaceId, {}),
          {
            ...previousProducts,
            products: [optimisticProduct, ...previousProducts.products],
            pagination: {
              ...previousProducts.pagination,
              total: previousProducts.pagination.total + 1,
            },
          }
        );
      }

      return { previousProducts };
    },
    onError: (err, newProduct, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(
          queryKeys.commerce.products.list(spaceId, {}),
          context.previousProducts
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.all,
      });
    },
  });
}

export function useUpdateProduct(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      input,
    }: {
      productId: string;
      input: UpdateProductInput;
    }) => updateProduct(spaceId, productId, input),
    onMutate: async ({ productId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.detail(spaceId, productId),
      });

      const previousProduct = queryClient.getQueryData<{ product: Product }>(
        queryKeys.commerce.products.detail(spaceId, productId)
      );

      if (previousProduct) {
        // Only spread safe primitive fields for optimistic update
        const { images, variants, ...safeInput } = input;
        queryClient.setQueryData<{ product: Product }>(
          queryKeys.commerce.products.detail(spaceId, productId),
          {
            product: {
              ...previousProduct.product,
              ...safeInput,
              updatedAt: new Date().toISOString(),
            },
          }
        );
      }

      return { previousProduct };
    },
    onError: (err, { productId }, context) => {
      if (context?.previousProduct) {
        queryClient.setQueryData(
          queryKeys.commerce.products.detail(spaceId, productId),
          context.previousProduct
        );
      }
    },
    onSettled: (data, error, { productId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.detail(spaceId, productId),
      });
    },
  });
}

export function useDeleteProduct(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) => deleteProduct(spaceId, productId),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const previousProducts = queryClient.getQueryData<ProductsResponse>(
        queryKeys.commerce.products.list(spaceId, {})
      );

      if (previousProducts) {
        queryClient.setQueryData<ProductsResponse>(
          queryKeys.commerce.products.list(spaceId, {}),
          {
            ...previousProducts,
            products: previousProducts.products.filter((p) => p.id !== productId),
            pagination: {
              ...previousProducts.pagination,
              total: previousProducts.pagination.total - 1,
            },
          }
        );
      }

      return { previousProducts };
    },
    onError: (err, productId, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(
          queryKeys.commerce.products.list(spaceId, {}),
          context.previousProducts
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.all,
      });
    },
  });
}

export function useToggleProductPublished(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      isPublished,
    }: {
      productId: string;
      isPublished: boolean;
    }) => toggleProductPublished(spaceId, productId, isPublished),
    onMutate: async ({ productId, isPublished }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const previousProducts = queryClient.getQueryData<ProductsResponse>(
        queryKeys.commerce.products.list(spaceId, {})
      );

      if (previousProducts) {
        queryClient.setQueryData<ProductsResponse>(
          queryKeys.commerce.products.list(spaceId, {}),
          {
            ...previousProducts,
            products: previousProducts.products.map((p) =>
              p.id === productId ? { ...p, isPublished } : p
            ),
          }
        );
      }

      return { previousProducts };
    },
    onError: (err, variables, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(
          queryKeys.commerce.products.list(spaceId, {}),
          context.previousProducts
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.all,
      });
    },
  });
}
