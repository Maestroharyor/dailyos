"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  type DeliveryNoteInput,
  deleteDeliveryNote,
  listDeliveryNotes,
  saveDeliveryNote,
} from "@/lib/actions/commerce/delivery-notes";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";

export interface DeliveryNote {
  id: string;
  key: string;
  label: string;
  body: string;
  isCollapsible: boolean;
  createdAt: string;
  updatedAt: string;
}

async function fetchDeliveryNotes(spaceId: string): Promise<DeliveryNote[]> {
  return unwrapAction(listDeliveryNotes(spaceId)) as Promise<DeliveryNote[]>;
}

export function useDeliveryNotes(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.commerce.deliveryNotes.list(spaceId),
    queryFn: () => fetchDeliveryNotes(spaceId),
    enabled: !!spaceId,
  });
}

export function useSaveDeliveryNote(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: DeliveryNoteInput) => saveDeliveryNote(spaceId, input)),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.commerce.deliveryNotes.all });

      const previousNotes = queryClient.getQueryData<DeliveryNote[]>(
        queryKeys.commerce.deliveryNotes.list(spaceId)
      );

      if (previousNotes) {
        // Save is an upsert keyed on the note key, so the optimistic write is
        // an edit when the key is already there and an insert when it is not.
        const existing = previousNotes.find((n) => n.key === input.key);
        const optimistic: DeliveryNote = {
          id: existing?.id ?? `temp-${Date.now()}`,
          key: input.key,
          label: input.label,
          body: input.body,
          isCollapsible: input.isCollapsible ?? existing?.isCollapsible ?? false,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        queryClient.setQueryData<DeliveryNote[]>(
          queryKeys.commerce.deliveryNotes.list(spaceId),
          existing
            ? previousNotes.map((n) => (n.key === input.key ? optimistic : n))
            : [...previousNotes, optimistic]
        );
      }

      return { previousNotes };
    },
    onError: (err, _input, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(
          queryKeys.commerce.deliveryNotes.list(spaceId),
          context.previousNotes
        );
      }
      notifyError(err, "Failed to save delivery note");
    },
    onSuccess: () => notifySuccess("Delivery note saved"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commerce.deliveryNotes.all });
    },
  });
}

export function useDeleteDeliveryNote(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((key: string) => deleteDeliveryNote(spaceId, key)),
    onMutate: async (key) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.commerce.deliveryNotes.all });

      const previousNotes = queryClient.getQueryData<DeliveryNote[]>(
        queryKeys.commerce.deliveryNotes.list(spaceId)
      );

      if (previousNotes) {
        queryClient.setQueryData<DeliveryNote[]>(
          queryKeys.commerce.deliveryNotes.list(spaceId),
          previousNotes.filter((n) => n.key !== key)
        );
      }

      return { previousNotes };
    },
    onError: (err, _key, context) => {
      if (context?.previousNotes) {
        queryClient.setQueryData(
          queryKeys.commerce.deliveryNotes.list(spaceId),
          context.previousNotes
        );
      }
      notifyError(err, "Failed to delete delivery note");
    },
    onSuccess: () => notifySuccess("Delivery note deleted"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.commerce.deliveryNotes.all });
    },
  });
}
