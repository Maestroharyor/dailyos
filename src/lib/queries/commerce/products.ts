"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { patchFirstPages, patchLists, restoreLists } from "../optimistic";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductPublished,
  listProducts,
  getProduct,
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
  return unwrapAction(listProducts(spaceId, filters));
}

async function fetchProduct(
  spaceId: string,
  productId: string
): Promise<{ product: Product }> {
  return unwrapAction(getProduct(spaceId, productId));
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
    mutationFn: wrapAction((input: CreateProductInput) => createProduct(spaceId, input)),
    onMutate: async (newProduct) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

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

      const previous = patchFirstPages<ProductsResponse>(
        queryClient,
        queryKeys.commerce.products.lists(spaceId),
        (data) => ({
          ...data,
          products: [optimisticProduct, ...data.products],
          pagination: { ...data.pagination, total: data.pagination.total + 1 },
        })
      );

      return { previous };
    },
    onError: (err, newProduct, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't add product");
    },
    onSuccess: () => notifySuccess("Product added"),
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
    mutationFn: wrapAction(({
      productId,
      input,
    }: {
      productId: string;
      input: UpdateProductInput;
    }) => updateProduct(spaceId, productId, input)),
    onMutate: async ({ productId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.detail(spaceId, productId),
      });

      const previousProduct = queryClient.getQueryData<{ product: Product }>(
        queryKeys.commerce.products.detail(spaceId, productId)
      );

      // Images and variants are their own rows with their own ids; the server
      // reconciles them and guessing here would show ids that never existed.
      const { images, variants, ...safeInput } = input;
      const updatedAt = new Date().toISOString();

      if (previousProduct) {
        queryClient.setQueryData<{ product: Product }>(
          queryKeys.commerce.products.detail(spaceId, productId),
          {
            product: { ...previousProduct.product, ...safeInput, updatedAt },
          }
        );
      }

      // The list needs the edit too. Without this a rename shows on the detail
      // page and the list still holds the old name until the server answers,
      // which offline is "until the shop is back online".
      const previous = patchLists<ProductsResponse>(
        queryClient,
        queryKeys.commerce.products.lists(spaceId),
        (data) => ({
          ...data,
          products: data.products.map((p) =>
            p.id === productId ? { ...p, ...safeInput, updatedAt } : p
          ),
        })
      );

      return { previousProduct, previous };
    },
    onError: (err, { productId }, context) => {
      if (context?.previousProduct) {
        queryClient.setQueryData(
          queryKeys.commerce.products.detail(spaceId, productId),
          context.previousProduct
        );
      }
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update product");
    },
    onSuccess: () => notifySuccess("Product updated"),
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
    mutationFn: wrapAction((productId: string) => deleteProduct(spaceId, productId)),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const previous = patchLists<ProductsResponse>(
        queryClient,
        queryKeys.commerce.products.lists(spaceId),
        (data) => {
          const products = data.products.filter((p) => p.id !== productId);
          if (products.length === data.products.length) return data;
          return {
            ...data,
            products,
            pagination: {
              ...data.pagination,
              total: Math.max(0, data.pagination.total - 1),
            },
          };
        }
      );

      return { previous };
    },
    onError: (err, productId, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't delete product");
    },
    onSuccess: () => notifySuccess("Product deleted"),
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
    mutationFn: wrapAction(({
      productId,
      isPublished,
    }: {
      productId: string;
      isPublished: boolean;
    }) => toggleProductPublished(spaceId, productId, isPublished)),
    onMutate: async ({ productId, isPublished }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const previous = patchLists<ProductsResponse>(
        queryClient,
        queryKeys.commerce.products.lists(spaceId),
        (data) => ({
          ...data,
          products: data.products.map((p) =>
            p.id === productId ? { ...p, isPublished } : p
          ),
        })
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      restoreLists(queryClient, context?.previous);
      notifyError(err, "Couldn't update product");
    },
    onSuccess: () => notifySuccess("Product updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.products.all,
      });
    },
  });
}
