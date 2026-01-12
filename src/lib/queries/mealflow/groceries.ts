"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createGroceryItem,
  updateGroceryItem,
  deleteGroceryItem,
  toggleGroceryChecked,
  clearCheckedItems,
  addIngredientsFromRecipe,
  type CreateGroceryInput,
  type UpdateGroceryInput,
} from "@/lib/actions/mealflow/groceries";

// Types
export interface GroceryItem {
  id: string;
  spaceId: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  price: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroceriesResponse {
  groceries: GroceryItem[];
  byCategory: Record<string, GroceryItem[]>;
  categories: string[];
  stats: {
    total: number;
    checked: number;
    unchecked: number;
    totalEstimatedCost: number;
  };
}

export interface GroceryFilters {
  category?: string;
  showChecked?: boolean;
}

// Fetch functions
async function fetchGroceries(
  spaceId: string,
  filters?: GroceryFilters
): Promise<GroceriesResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters?.category && filters.category !== "all")
    params.set("category", filters.category);
  if (filters?.showChecked !== undefined)
    params.set("showChecked", String(filters.showChecked));

  const response = await fetch(`/api/mealflow/groceries?${params}`);
  if (!response.ok) throw new Error("Failed to fetch groceries");
  return response.json();
}

// Query hooks
export function useGroceries(spaceId: string, filters?: GroceryFilters) {
  return useQuery({
    queryKey: queryKeys.mealflow.groceries.list(spaceId, filters),
    queryFn: () => fetchGroceries(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useGroceriesSuspense(
  spaceId: string,
  filters?: GroceryFilters
) {
  return useSuspenseQuery({
    queryKey: queryKeys.mealflow.groceries.list(spaceId, filters),
    queryFn: () => fetchGroceries(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateGroceryItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGroceryInput) =>
      createGroceryItem(spaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}

export function useUpdateGroceryItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      itemId,
      input,
    }: {
      itemId: string;
      input: UpdateGroceryInput;
    }) => updateGroceryItem(spaceId, itemId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}

export function useDeleteGroceryItem(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => deleteGroceryItem(spaceId, itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });

      const queries = queryClient.getQueriesData<GroceriesResponse>({
        queryKey: queryKeys.mealflow.groceries.all,
      });

      queries.forEach(([queryKey, data]) => {
        if (data) {
          const deleted = data.groceries.find((g) => g.id === itemId);
          const updatedGroceries = data.groceries.filter(
            (g) => g.id !== itemId
          );

          // Rebuild byCategory
          const updatedByCategory: Record<string, GroceryItem[]> = {};
          updatedGroceries.forEach((item) => {
            if (!updatedByCategory[item.category]) {
              updatedByCategory[item.category] = [];
            }
            updatedByCategory[item.category].push(item);
          });

          queryClient.setQueryData<GroceriesResponse>(queryKey, {
            ...data,
            groceries: updatedGroceries,
            byCategory: updatedByCategory,
            categories: Object.keys(updatedByCategory),
            stats: {
              total: data.stats.total - 1,
              checked: data.stats.checked - (deleted?.checked ? 1 : 0),
              unchecked: data.stats.unchecked - (deleted?.checked ? 0 : 1),
              totalEstimatedCost:
                data.stats.totalEstimatedCost -
                (deleted?.price
                  ? Number(deleted.price) * Number(deleted.quantity)
                  : 0),
            },
          });
        }
      });

      return { queries };
    },
    onError: (err, itemId, context) => {
      context?.queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}

export function useToggleGroceryChecked(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      toggleGroceryChecked(spaceId, itemId, checked),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });

      const queries = queryClient.getQueriesData<GroceriesResponse>({
        queryKey: queryKeys.mealflow.groceries.all,
      });

      queries.forEach(([queryKey, data]) => {
        if (data) {
          const item = data.groceries.find((g) => g.id === itemId);
          if (item) {
            queryClient.setQueryData<GroceriesResponse>(queryKey, {
              ...data,
              groceries: data.groceries.map((g) =>
                g.id === itemId ? { ...g, checked } : g
              ),
              stats: {
                ...data.stats,
                checked: data.stats.checked + (checked ? 1 : -1),
                unchecked: data.stats.unchecked + (checked ? -1 : 1),
              },
            });
          }
        }
      });

      return { queries };
    },
    onError: (err, variables, context) => {
      context?.queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}

export function useClearCheckedItems(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => clearCheckedItems(spaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}

export function useAddIngredientsFromRecipe(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recipeId: string) =>
      addIngredientsFromRecipe(spaceId, recipeId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.groceries.all,
      });
    },
  });
}
