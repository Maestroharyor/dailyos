"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/lib/actions/commerce/categories";

// Types
export interface Category {
  id: string;
  spaceId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  _count?: { products: number };
  children?: Category[];
}

export interface CategoriesResponse {
  categories: Category[];
  flatCategories: Category[];
}

// Fetch functions
async function fetchCategories(spaceId: string): Promise<CategoriesResponse> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/categories?${params}`);
  if (!response.ok) throw new Error("Failed to fetch categories");
  return response.json();
}

// Query hooks
export function useCategories(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.categories.list(spaceId),
    queryFn: () => fetchCategories(spaceId),
    enabled: !!spaceId,
  });
}

export function useCategoriesSuspense(spaceId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.categories.list(spaceId),
    queryFn: () => fetchCategories(spaceId),
  });
}

// Mutation hooks
export function useCreateCategory(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCategoryInput) => createCategory(spaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}

export function useUpdateCategory(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      input,
    }: {
      categoryId: string;
      input: UpdateCategoryInput;
    }) => updateCategory(spaceId, categoryId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}

export function useDeleteCategory(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(spaceId, categoryId),
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.categories.all,
      });

      const previousCategories = queryClient.getQueryData<CategoriesResponse>(
        queryKeys.commerce.categories.list(spaceId)
      );

      if (previousCategories) {
        queryClient.setQueryData<CategoriesResponse>(
          queryKeys.commerce.categories.list(spaceId),
          {
            ...previousCategories,
            categories: previousCategories.categories.filter(
              (c) => c.id !== categoryId
            ),
            flatCategories: previousCategories.flatCategories.filter(
              (c) => c.id !== categoryId
            ),
          }
        );
      }

      return { previousCategories };
    },
    onError: (err, categoryId, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.commerce.categories.list(spaceId),
          context.previousCategories
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}
