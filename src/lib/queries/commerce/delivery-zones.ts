"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import {
  listDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  type DeliveryZoneInput,
} from "@/lib/actions/commerce/delivery-zones";

// Types
export interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Fetch functions
async function fetchDeliveryZones(spaceId: string): Promise<DeliveryZone[]> {
  return unwrapAction(listDeliveryZones(spaceId)) as Promise<DeliveryZone[]>;
}

// Query hooks
export function useDeliveryZones(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.deliveryZones.list(spaceId),
    queryFn: () => fetchDeliveryZones(spaceId),
    enabled: !!spaceId,
  });
}

// Mutation hooks
export function useCreateDeliveryZone(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: DeliveryZoneInput) =>
      createDeliveryZone(spaceId, input)
    ),
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });

      const previousZones = queryClient.getQueryData<DeliveryZone[]>(
        queryKeys.commerce.deliveryZones.list(spaceId)
      );

      if (previousZones) {
        const optimisticZone: DeliveryZone = {
          id: `temp-${Date.now()}`,
          name: input.name,
          fee: input.fee,
          isActive: input.isActive ?? true,
          sortOrder: input.sortOrder ?? 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<DeliveryZone[]>(
          queryKeys.commerce.deliveryZones.list(spaceId),
          [...previousZones, optimisticZone]
        );
      }

      return { previousZones };
    },
    onError: (err, input, context) => {
      if (context?.previousZones) {
        queryClient.setQueryData(
          queryKeys.commerce.deliveryZones.list(spaceId),
          context.previousZones
        );
      }
      notifyError(err, "Couldn't add delivery zone");
    },
    onSuccess: () => notifySuccess("Delivery zone added"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });
    },
  });
}

export function useUpdateDeliveryZone(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(
      ({ zoneId, input }: { zoneId: string; input: Partial<DeliveryZoneInput> }) =>
        updateDeliveryZone(spaceId, zoneId, input)
    ),
    onMutate: async ({ zoneId, input }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });

      const previousZones = queryClient.getQueryData<DeliveryZone[]>(
        queryKeys.commerce.deliveryZones.list(spaceId)
      );

      if (previousZones) {
        queryClient.setQueryData<DeliveryZone[]>(
          queryKeys.commerce.deliveryZones.list(spaceId),
          previousZones.map((z) => (z.id === zoneId ? { ...z, ...input } : z))
        );
      }

      return { previousZones };
    },
    onError: (err, vars, context) => {
      if (context?.previousZones) {
        queryClient.setQueryData(
          queryKeys.commerce.deliveryZones.list(spaceId),
          context.previousZones
        );
      }
      notifyError(err, "Couldn't update delivery zone");
    },
    onSuccess: () => notifySuccess("Delivery zone updated"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });
    },
  });
}

export function useDeleteDeliveryZone(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((zoneId: string) =>
      deleteDeliveryZone(spaceId, zoneId)
    ),
    onMutate: async (zoneId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });

      const previousZones = queryClient.getQueryData<DeliveryZone[]>(
        queryKeys.commerce.deliveryZones.list(spaceId)
      );

      if (previousZones) {
        queryClient.setQueryData<DeliveryZone[]>(
          queryKeys.commerce.deliveryZones.list(spaceId),
          previousZones.filter((z) => z.id !== zoneId)
        );
      }

      return { previousZones };
    },
    onError: (err, zoneId, context) => {
      if (context?.previousZones) {
        queryClient.setQueryData(
          queryKeys.commerce.deliveryZones.list(spaceId),
          context.previousZones
        );
      }
      notifyError(err, "Couldn't delete delivery zone");
    },
    onSuccess: () => notifySuccess("Delivery zone deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.commerce.deliveryZones.all,
      });
    },
  });
}
