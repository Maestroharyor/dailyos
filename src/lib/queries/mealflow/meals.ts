"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createMeal,
  updateMeal,
  deleteMeal,
  addMealFromRecipe,
  type CreateMealInput,
  type UpdateMealInput,
} from "@/lib/actions/mealflow/meals";

// Types
export interface Meal {
  id: string;
  spaceId: string;
  name: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
  date: string;
  notes: string | null;
  recipeId: string | null;
  recipe: {
    id: string;
    name: string;
    image: string | null;
    cookTime: number;
    category: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface MealsResponse {
  meals: Meal[];
  mealsByDate: Record<string, Meal[]>;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface MealFilters {
  startDate?: string;
  endDate?: string;
}

// Fetch functions
async function fetchMeals(
  spaceId: string,
  filters?: MealFilters
): Promise<MealsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters?.startDate) params.set("startDate", filters.startDate);
  if (filters?.endDate) params.set("endDate", filters.endDate);

  const response = await fetch(`/api/mealflow/meals?${params}`);
  if (!response.ok) throw new Error("Failed to fetch meals");
  return response.json();
}

// Query hooks
export function useMeals(spaceId: string, dateRange?: MealFilters) {
  return useQuery({
    queryKey: queryKeys.mealflow.meals.list(spaceId, {
      start: dateRange?.startDate || "",
      end: dateRange?.endDate || "",
    }),
    queryFn: () => fetchMeals(spaceId, dateRange),
    enabled: !!spaceId,
  });
}

export function useMealsSuspense(spaceId: string, dateRange?: MealFilters) {
  return useSuspenseQuery({
    queryKey: queryKeys.mealflow.meals.list(spaceId, {
      start: dateRange?.startDate || "",
      end: dateRange?.endDate || "",
    }),
    queryFn: () => fetchMeals(spaceId, dateRange),
  });
}

// Mutation hooks
export function useCreateMeal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMealInput) => createMeal(spaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.meals.all,
      });
    },
  });
}

export function useUpdateMeal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      mealId,
      input,
    }: {
      mealId: string;
      input: UpdateMealInput;
    }) => updateMeal(spaceId, mealId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.meals.all,
      });
    },
  });
}

export function useDeleteMeal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mealId: string) => deleteMeal(spaceId, mealId),
    onMutate: async (mealId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.mealflow.meals.all,
      });

      // Optimistic update for all meal queries
      const queries = queryClient.getQueriesData<MealsResponse>({
        queryKey: queryKeys.mealflow.meals.all,
      });

      queries.forEach(([queryKey, data]) => {
        if (data) {
          const updatedMeals = data.meals.filter((m) => m.id !== mealId);
          const updatedByDate: Record<string, Meal[]> = {};

          updatedMeals.forEach((meal) => {
            const dateKey = new Date(meal.date).toISOString().split("T")[0];
            if (!updatedByDate[dateKey]) {
              updatedByDate[dateKey] = [];
            }
            updatedByDate[dateKey].push(meal);
          });

          queryClient.setQueryData<MealsResponse>(queryKey, {
            ...data,
            meals: updatedMeals,
            mealsByDate: updatedByDate,
          });
        }
      });

      return { queries };
    },
    onError: (err, mealId, context) => {
      context?.queries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, data);
        }
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.meals.all,
      });
    },
  });
}

export function useAddMealFromRecipe(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      recipeId,
      date,
      type,
    }: {
      recipeId: string;
      date: string;
      type: CreateMealInput["type"];
    }) => addMealFromRecipe(spaceId, recipeId, date, type),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.mealflow.meals.all,
      });
    },
  });
}
