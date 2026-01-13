"use client";

import {
  useQuery,
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../keys";
import {
  updateCommerceSettings,
  type UpdateSettingsInput,
} from "@/lib/actions/commerce/settings";

// Types
export interface PaymentMethod {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CommerceSettings {
  id: string;
  spaceId: string;
  currency: string;
  taxRate: number;
  lowStockThreshold: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  paymentMethods: PaymentMethod[];
  updatedAt: string;
}

export interface SettingsResponse {
  settings: CommerceSettings;
}

// Fetch functions
async function fetchSettings(spaceId: string): Promise<SettingsResponse> {
  const params = new URLSearchParams({ spaceId });
  const response = await fetch(`/api/commerce/settings?${params}`);
  if (!response.ok) throw new Error("Failed to fetch settings");
  const json = await response.json();
  return json.data;
}

// Query hooks
export function useCommerceSettings(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.settings(spaceId),
    queryFn: () => fetchSettings(spaceId),
    enabled: !!spaceId,
  });
}

export function useCommerceSettingsSuspense(spaceId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.commerce.settings(spaceId),
    queryFn: () => fetchSettings(spaceId),
  });
}

// Mutation hooks
export function useUpdateCommerceSettings(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      updateCommerceSettings(spaceId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.settings(spaceId),
      });

      const previousSettings = queryClient.getQueryData<SettingsResponse>(
        queryKeys.commerce.settings(spaceId)
      );

      if (previousSettings) {
        queryClient.setQueryData<SettingsResponse>(
          queryKeys.commerce.settings(spaceId),
          {
            settings: { ...previousSettings.settings, ...input },
          }
        );
      }

      return { previousSettings };
    },
    onError: (err, input, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(
          queryKeys.commerce.settings(spaceId),
          context.previousSettings
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.settings(spaceId),
      });
    },
  });
}
