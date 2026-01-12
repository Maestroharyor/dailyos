"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  createGoal,
  updateGoal,
  deleteGoal,
  contributeToGoal,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@/lib/actions/finance/goals";

// Types
export interface Goal {
  id: string;
  spaceId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  description: string | null;
  progress: number;
  isCompleted: boolean;
  daysRemaining: number;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoalsResponse {
  goals: Goal[];
  totals: {
    target: number;
    current: number;
    remaining: number;
    completedCount: number;
    activeCount: number;
  };
}

export interface GoalFilters {
  status?: string;
}

// Fetch functions
async function fetchGoals(
  spaceId: string,
  filters?: GoalFilters
): Promise<GoalsResponse> {
  const params = new URLSearchParams({ spaceId });
  if (filters?.status && filters.status !== "all")
    params.set("status", filters.status);

  const response = await fetch(`/api/finance/goals?${params}`);
  if (!response.ok) throw new Error("Failed to fetch goals");
  return response.json();
}

// Query hooks
export function useGoals(spaceId: string, filters?: GoalFilters) {
  return useQuery({
    queryKey: queryKeys.finance.goals.list(spaceId),
    queryFn: () => fetchGoals(spaceId, filters),
    enabled: !!spaceId,
  });
}

export function useGoalsSuspense(spaceId: string, filters?: GoalFilters) {
  return useSuspenseQuery({
    queryKey: queryKeys.finance.goals.list(spaceId),
    queryFn: () => fetchGoals(spaceId, filters),
  });
}

// Mutation hooks
export function useCreateGoal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(spaceId, input),
    onMutate: async (newGoal) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.goals.all,
      });

      const previousGoals = queryClient.getQueryData<GoalsResponse>(
        queryKeys.finance.goals.list(spaceId)
      );

      if (previousGoals) {
        const goal: Goal = {
          id: `temp-${Date.now()}`,
          spaceId,
          name: newGoal.name,
          targetAmount: newGoal.targetAmount,
          currentAmount: newGoal.currentAmount || 0,
          deadline: newGoal.deadline,
          description: newGoal.description || null,
          progress: 0,
          isCompleted: false,
          daysRemaining: Math.ceil(
            (new Date(newGoal.deadline).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          ),
          isOverdue: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<GoalsResponse>(
          queryKeys.finance.goals.list(spaceId),
          {
            ...previousGoals,
            goals: [...previousGoals.goals, goal],
            totals: {
              ...previousGoals.totals,
              target: previousGoals.totals.target + newGoal.targetAmount,
              current:
                previousGoals.totals.current + (newGoal.currentAmount || 0),
              remaining:
                previousGoals.totals.remaining +
                newGoal.targetAmount -
                (newGoal.currentAmount || 0),
              activeCount: previousGoals.totals.activeCount + 1,
            },
          }
        );
      }

      return { previousGoals };
    },
    onError: (err, newGoal, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(
          queryKeys.finance.goals.list(spaceId),
          context.previousGoals
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.goals.all,
      });
    },
  });
}

export function useUpdateGoal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      goalId,
      input,
    }: {
      goalId: string;
      input: UpdateGoalInput;
    }) => updateGoal(spaceId, goalId, input),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.goals.all,
      });
    },
  });
}

export function useDeleteGoal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(spaceId, goalId),
    onMutate: async (goalId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.goals.all,
      });

      const previousGoals = queryClient.getQueryData<GoalsResponse>(
        queryKeys.finance.goals.list(spaceId)
      );

      if (previousGoals) {
        const deleted = previousGoals.goals.find((g) => g.id === goalId);

        queryClient.setQueryData<GoalsResponse>(
          queryKeys.finance.goals.list(spaceId),
          {
            ...previousGoals,
            goals: previousGoals.goals.filter((g) => g.id !== goalId),
            totals: deleted
              ? {
                  ...previousGoals.totals,
                  target: previousGoals.totals.target - deleted.targetAmount,
                  current: previousGoals.totals.current - deleted.currentAmount,
                  remaining:
                    previousGoals.totals.remaining -
                    (deleted.targetAmount - deleted.currentAmount),
                  activeCount: deleted.isCompleted
                    ? previousGoals.totals.activeCount
                    : previousGoals.totals.activeCount - 1,
                  completedCount: deleted.isCompleted
                    ? previousGoals.totals.completedCount - 1
                    : previousGoals.totals.completedCount,
                }
              : previousGoals.totals,
          }
        );
      }

      return { previousGoals };
    },
    onError: (err, goalId, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(
          queryKeys.finance.goals.list(spaceId),
          context.previousGoals
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.goals.all,
      });
    },
  });
}

export function useContributeToGoal(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ goalId, amount }: { goalId: string; amount: number }) =>
      contributeToGoal(spaceId, goalId, amount),
    onMutate: async ({ goalId, amount }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.goals.all,
      });

      const previousGoals = queryClient.getQueryData<GoalsResponse>(
        queryKeys.finance.goals.list(spaceId)
      );

      if (previousGoals) {
        queryClient.setQueryData<GoalsResponse>(
          queryKeys.finance.goals.list(spaceId),
          {
            ...previousGoals,
            goals: previousGoals.goals.map((g) =>
              g.id === goalId
                ? {
                    ...g,
                    currentAmount: g.currentAmount + amount,
                    progress: Math.min(
                      ((g.currentAmount + amount) / g.targetAmount) * 100,
                      100
                    ),
                    isCompleted: g.currentAmount + amount >= g.targetAmount,
                  }
                : g
            ),
            totals: {
              ...previousGoals.totals,
              current: previousGoals.totals.current + amount,
              remaining: previousGoals.totals.remaining - amount,
            },
          }
        );
      }

      return { previousGoals };
    },
    onError: (err, variables, context) => {
      if (context?.previousGoals) {
        queryClient.setQueryData(
          queryKeys.finance.goals.list(spaceId),
          context.previousGoals
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.goals.all,
      });
    },
  });
}
