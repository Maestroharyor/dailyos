"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  patchFirstPages,
  patchLists,
  restoreLists,
  type ListSnapshot,
} from "../optimistic";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import type { ActionResponse } from "@/lib/action-response";
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

/**
 * The product a create shows before the server has one.
 *
 * Shared by the optimistic cache write and the stand-in result a queued create
 * hands back, because the two are the same row seen from either side and
 * letting them drift is how a queued product looks different from an
 * optimistic one for no reason a user could explain.
 */
function optimisticProduct(
  spaceId: string,
  input: CreateProductInput,
  id: string
): Product {
  const now = new Date().toISOString();
  return {
    id,
    spaceId,
    sku: input.sku,
    name: input.name,
    description: input.description || null,
    price: input.price,
    costPrice: input.costPrice,
    salePrice: input.salePrice || null,
    onSale: input.onSale || false,
    status: input.status || "draft",
    isPublished: input.isPublished || false,
    categoryId: input.categoryId || null,
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now,
    category: null,
    images: (input.images || []).map((img, i) => ({
      id: `${id}-img-${i}`,
      url: img.url,
      alt: img.alt || null,
      isPrimary: img.isPrimary || false,
    })),
    variants: (input.variants || []).map((v, i) => ({
      id: `${id}-var-${i}`,
      sku: v.sku,
      name: v.name,
      price: v.price,
      costPrice: v.costPrice,
    })),
  };
}

// Mutation hooks with optimistic updates
export function useCreateProduct(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Queues rather than fails when the network is gone.
  //
  // A product created offline has no images. Uploading one goes to Supabase
  // Storage through /api/uploads, which no queue can stand in for — the file
  // is on the device and the URL it will get does not exist yet. The form
  // surfaces that upload failure on its own; the product still saves, and the
  // pictures are added when the shop is back online. Everything else about the
  // product — its price, its SKU, its stock — is here.
  return useOfflineMutation<
    CreateProductInput,
    ActionResponse<Product>,
    { previous: ListSnapshot<ProductsResponse> }
  >({
    mutationFn: wrapAction((input: CreateProductInput) => createProduct(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "product",
    action: "create",
    // Inventory adjustments queued behind this one point at the placeholder id
    // until the product itself syncs.
    createsEntity: true,
    toPayload: (input, requestId) => ({ ...input, clientRequestId: requestId }),
    toLocalResult: (input, _requestId, placeholder) => ({
      success: true,
      message: "Product queued",
      data: optimisticProduct(spaceId, input, placeholder),
    }),
    // `placeholder` rather than a temp id of our own: the category select on
    // the new-product form reads categories back out of this cache, so the id
    // the optimistic row carries is the id a dependent write will reference.
    // It has to be the one the outbox knows.
    onMutate: async (newProduct, placeholder) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.products.all,
      });

      const optimistic = optimisticProduct(spaceId, newProduct, placeholder);

      const previous = patchFirstPages<ProductsResponse>(
        queryClient,
        queryKeys.commerce.products.lists(spaceId),
        (data) => ({
          ...data,
          products: [optimistic, ...data.products],
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
      // Both keys: this writes the detail *and* every cached list page, and a
      // list refetch already in flight would resolve after the patch and
      // silently revert it. Offline that revert sticks until reconnect,
      // because the invalidate that would correct it never resolves.
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.products.detail(spaceId, productId),
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.commerce.products.lists(spaceId),
        }),
      ]);

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
