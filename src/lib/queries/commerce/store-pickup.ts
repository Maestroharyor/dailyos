"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  getStorePickupSetting,
  type StorePickupInput,
  saveStorePickupSetting,
} from "@/lib/actions/commerce/store-pickup";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";

export interface StorePickupSetting {
  id: string;
  isEnabled: boolean;
  label: string;
  address: string | null;
  homeState: string;
  homeFee: number;
  homeWindowLabel: string;
  homeHoldDays: number;
  homeNoteKey: string;
  awayFee: number;
  awayFeeRefundable: boolean;
  awayWindowLabel: string;
  awayHoldDays: number;
  awayNoteKey: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchStorePickup(spaceId: string): Promise<StorePickupSetting | null> {
  return unwrapAction(getStorePickupSetting(spaceId)) as Promise<StorePickupSetting | null>;
}

export function useStorePickup(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.storePickup.detail(spaceId),
    queryFn: () => fetchStorePickup(spaceId),
    enabled: !!spaceId,
  });
}

export function useSaveStorePickup(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: StorePickupInput) => saveStorePickupSetting(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.commerce.storePickup.all });

      const previous = queryClient.getQueryData<StorePickupSetting | null>(
        queryKeys.commerce.storePickup.detail(spaceId)
      );

      if (previous) {
        queryClient.setQueryData<StorePickupSetting>(
          queryKeys.commerce.storePickup.detail(spaceId),
          { ...previous, ...input, updatedAt: new Date().toISOString() }
        );
      }

      return { previous };
    },
    onError: (err, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.commerce.storePickup.detail(spaceId), context.previous);
      }
      notifyError(err, "Failed to save store pickup settings");
    },
    onSuccess: () => notifySuccess("Store pickup saved"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commerce.storePickup.all });
      // Options are read as one catalog, so a pickup change moves what
      // checkout shows alongside the zones.
      queryClient.invalidateQueries({ queryKey: queryKeys.commerce.deliveryZones.all });
    },
  });
}
