"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  saveFromMealDb,
  type CreateRecipeInput,
  type UpdateRecipeInput,
} from "@/lib/actions/mealflow/recipes";

// Types
export interface Recipe {
  id: string;
  spaceId: string;
  name: string;
  category: "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | "other";
  cookTime: number;
  ingredients: string[];
  instructions: string[];
  image: string | null;
  source: "local" | "mealdb";
  mealDbId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipesResponse {
  recipes: Recipe[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RecipeFilters {
  search?: string;
  category?: string;
  source?: string;
  page?: number;
  limit?: number;
}

// Fetch functions
async function fetchRecipes(
  spaceId: string,
  filters: RecipeFilters
): Promise<RecipesResponse> {
  const data = await unwrapAction(listRecipes(spaceId, filters));
  return data as unknown as RecipesResponse;
}

// Query hooks
export function useRecipes(spaceId: string, filters: RecipeFilters = {}) {
  return useQuery({
    queryKey: queryKeys.mealflow.recipes.list(spaceId, filters),
    queryFn: () => fetchRecipes(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useRecipesSuspense(
  spaceId: string,
  filters: RecipeFilters = {}
) {
  return useSuspenseQuery({
    queryKey: queryKeys.mealflow.recipes.list(spaceId, filters),
    queryFn: () => fetchRecipes(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateRecipe(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: CreateRecipeInput) => createRecipe(spaceId, input)),
    onSuccess: () => {
      notifySuccess("Recipe added");
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.recipes.all,
      });
    },
    onError: (err) => notifyError(err, "Couldn't add recipe"),
  });
}

export function useUpdateRecipe(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(({
      recipeId,
      input,
    }: {
      recipeId: string;
      input: UpdateRecipeInput;
    }) => updateRecipe(spaceId, recipeId, input)),
    onSuccess: () => notifySuccess("Recipe updated"),
    onError: (err) => notifyError(err, "Couldn't update recipe"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.recipes.all,
      });
    },
  });
}

export function useDeleteRecipe(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((recipeId: string) => deleteRecipe(spaceId, recipeId)),
    onMutate: async (recipeId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.mealflow.recipes.all,
      });

      const previousRecipes = queryClient.getQueryData<RecipesResponse>(
        queryKeys.mealflow.recipes.list(spaceId, {})
      );

      if (previousRecipes) {
        queryClient.setQueryData<RecipesResponse>(
          queryKeys.mealflow.recipes.list(spaceId, {}),
          {
            ...previousRecipes,
            recipes: previousRecipes.recipes.filter((r) => r.id !== recipeId),
            pagination: {
              ...previousRecipes.pagination,
              total: previousRecipes.pagination.total - 1,
            },
          }
        );
      }

      return { previousRecipes };
    },
    onError: (err, recipeId, context) => {
      if (context?.previousRecipes) {
        queryClient.setQueryData(
          queryKeys.mealflow.recipes.list(spaceId, {}),
          context.previousRecipes
        );
      }
      notifyError(err, "Couldn't delete recipe");
    },
    onSuccess: () => notifySuccess("Recipe deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.recipes.all,
      });
    },
  });
}

export function useSaveFromMealDb(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((mealDbRecipe: Parameters<typeof saveFromMealDb>[1]) =>
      saveFromMealDb(spaceId, mealDbRecipe)),
    onSuccess: () => {
      notifySuccess("Recipe saved");
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.recipes.all,
      });
    },
    onError: (err) => notifyError(err, "Couldn't save recipe"),
  });
}
