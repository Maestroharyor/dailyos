"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import {
  getFinanceSettings,
  updateFinanceSettings,
  type UpdateFinanceSettingsInput,
} from "@/lib/actions/finance/settings";

// Types
export interface FinanceSettings {
  id: string;
  spaceId: string;
  currency: string;
  categories: string[];
  tags: string[];
  updatedAt: string;
}

// Fetch functions
async function fetchFinanceSettings(spaceId: string): Promise<FinanceSettings> {
  return unwrapAction(getFinanceSettings(spaceId));
}

// Query hooks
export function useFinanceSettings(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.finance.settings(spaceId),
    queryFn: () => fetchFinanceSettings(spaceId),
    enabled: !!spaceId,
  });
}

// Mutation hooks
export function useUpdateFinanceSettings(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: UpdateFinanceSettingsInput) =>
      updateFinanceSettings(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.finance.settings(spaceId),
      });

      const previous = queryClient.getQueryData<FinanceSettings>(
        queryKeys.finance.settings(spaceId)
      );

      if (previous) {
        queryClient.setQueryData<FinanceSettings>(
          queryKeys.finance.settings(spaceId),
          { ...previous, ...input }
        );
      }

      return { previous };
    },
    onError: (err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.finance.settings(spaceId),
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.finance.settings(spaceId),
      });
    },
  });
}
