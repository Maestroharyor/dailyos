"use client";

import { useQuery, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { useOfflineMutation } from "@/lib/offline/use-offline-mutation";
import { useSession } from "@/lib/supabase/use-session";
import type { ActionResponse } from "@/lib/action-response";
import {
  listCategories,
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
  return unwrapAction(listCategories(spaceId)) as Promise<CategoriesResponse>;
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
/**
 * The category a create shows before the server has one. Shared by the
 * optimistic cache write and the stand-in a queued create hands back, so the
 * two cannot drift.
 */
function optimisticCategory(spaceId: string, input: CreateCategoryInput, id: string): Category {
  return {
    id,
    spaceId,
    name: input.name,
    slug: input.slug,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? 0,
    _count: { products: 0 },
  };
}

export function useCreateCategory(spaceId: string) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Queues rather than fails when the network is gone. A product queued behind
  // this one points at the placeholder id until the category itself syncs.
  return useOfflineMutation<
    CreateCategoryInput,
    ActionResponse<Category>,
    { previousCategories: CategoriesResponse | undefined }
  >({
    mutationFn: wrapAction((input: CreateCategoryInput) => createCategory(spaceId, input)),
    spaceId,
    userId: session?.user.id ?? "",
    entity: "category",
    action: "create",
    createsEntity: true,
    toPayload: (input, requestId) => ({ ...input, clientRequestId: requestId }),
    toLocalResult: (input, _requestId, placeholder) => ({
      success: true,
      message: "Category queued",
      data: optimisticCategory(spaceId, input, placeholder),
    }),
    // `placeholder`, not a temp id: the new-product form builds its category
    // select from this cache, so a product created offline against a category
    // created offline carries whatever id is written here. Only a `local-` one
    // is visible to the outbox's dependency ordering and id rewriting.
    onMutate: async (input, placeholder) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.categories.all,
      });

      const previousCategories = queryClient.getQueryData<CategoriesResponse>(
        queryKeys.commerce.categories.list(spaceId),
      );

      if (previousCategories) {
        const optimistic = optimisticCategory(spaceId, input, placeholder);

        queryClient.setQueryData<CategoriesResponse>(queryKeys.commerce.categories.list(spaceId), {
          ...previousCategories,
          categories: [...previousCategories.categories, optimistic],
          flatCategories: [...previousCategories.flatCategories, optimistic],
        });
      }

      return { previousCategories };
    },
    onError: (err, input, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.commerce.categories.list(spaceId),
          context.previousCategories,
        );
      }
      notifyError(err, "Couldn't add category");
    },
    onSuccess: () => notifySuccess("Category added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}

export function useUpdateCategory(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(
      ({ categoryId, input }: { categoryId: string; input: UpdateCategoryInput }) =>
        updateCategory(spaceId, categoryId, input),
    ),
    onMutate: async ({ categoryId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.categories.all,
      });

      const previousCategories = queryClient.getQueryData<CategoriesResponse>(
        queryKeys.commerce.categories.list(spaceId),
      );

      if (previousCategories) {
        const patch = (c: Category) => (c.id === categoryId ? { ...c, ...input } : c);

        queryClient.setQueryData<CategoriesResponse>(queryKeys.commerce.categories.list(spaceId), {
          ...previousCategories,
          categories: previousCategories.categories.map(patch),
          flatCategories: previousCategories.flatCategories.map(patch),
        });
      }

      return { previousCategories };
    },
    onError: (err, vars, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.commerce.categories.list(spaceId),
          context.previousCategories,
        );
      }
      notifyError(err, "Couldn't update category");
    },
    onSuccess: () => notifySuccess("Category updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}

export function useDeleteCategory(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((categoryId: string) => deleteCategory(spaceId, categoryId)),
    onMutate: async (categoryId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.categories.all,
      });

      const previousCategories = queryClient.getQueryData<CategoriesResponse>(
        queryKeys.commerce.categories.list(spaceId),
      );

      if (previousCategories) {
        queryClient.setQueryData<CategoriesResponse>(queryKeys.commerce.categories.list(spaceId), {
          ...previousCategories,
          categories: previousCategories.categories.filter((c) => c.id !== categoryId),
          flatCategories: previousCategories.flatCategories.filter((c) => c.id !== categoryId),
        });
      }

      return { previousCategories };
    },
    onError: (err, categoryId, context) => {
      if (context?.previousCategories) {
        queryClient.setQueryData(
          queryKeys.commerce.categories.list(spaceId),
          context.previousCategories,
        );
      }
      notifyError(err, "Couldn't delete category");
    },
    onSuccess: () => notifySuccess("Category deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.categories.all,
      });
    },
  });
}
