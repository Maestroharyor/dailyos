"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../keys";
import { wrapAction, unwrapAction } from "@/lib/action-mutation";
import { notifySuccess, notifyError } from "../mutation-feedback";
import { requireOnline } from "@/lib/offline/online-only";
import {
  connectStorefront,
  disconnectStorefront,
  regenerateStorefrontKey,
  getStorefrontStatus,
} from "@/lib/actions/commerce/storefront";

export interface StorefrontStatus {
  spaceId: string;
  enabled: boolean;
  key: string | null;
  connectedSpace: { id: string; name: string } | null;
}

async function fetchStorefrontStatus(spaceId: string): Promise<StorefrontStatus> {
  return unwrapAction(getStorefrontStatus(spaceId));
}

export function useStorefrontConnection(spaceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.commerce.storefront(spaceId),
    queryFn: () => fetchStorefrontStatus(spaceId),
    enabled: !!spaceId && enabled,
  });
}

/**
 * The three mutations below are deliberately not optimistic, the one place in
 * commerce where that is the right answer.
 *
 * Connecting or regenerating produces a storefront key the server mints. There
 * is no honest placeholder for a secret: a fabricated one is a value a
 * merchant may copy into a live storefront's configuration, and it would not
 * work. So they wait for the real answer.
 */
function useStorefrontInvalidate(spaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.commerce.storefront(spaceId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.commerce.settings(spaceId) });
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
  };
}

export function useConnectStorefront(spaceId: string) {
  const invalidate = useStorefrontInvalidate(spaceId);
  return useMutation({
    mutationFn: wrapAction(() => {
      requireOnline("Connecting the storefront");
      return connectStorefront(spaceId);
    }),
    onSuccess: () => notifySuccess("Storefront connected"),
    onError: (err) => notifyError(err, "Couldn't connect storefront"),
    onSettled: invalidate,
  });
}

export function useDisconnectStorefront(spaceId: string) {
  const invalidate = useStorefrontInvalidate(spaceId);
  return useMutation({
    mutationFn: wrapAction(() => {
      requireOnline("Disconnecting the storefront");
      return disconnectStorefront(spaceId);
    }),
    onSuccess: () => notifySuccess("Storefront disconnected"),
    onError: (err) => notifyError(err, "Couldn't disconnect storefront"),
    onSettled: invalidate,
  });
}

export function useRegenerateStorefrontKey(spaceId: string) {
  const invalidate = useStorefrontInvalidate(spaceId);
  return useMutation({
    mutationFn: wrapAction(() => {
      requireOnline("Regenerating the storefront key");
      return regenerateStorefrontKey(spaceId);
    }),
    onSuccess: () => notifySuccess("Storefront key regenerated"),
    onError: (err) => notifyError(err, "Couldn't regenerate storefront key"),
    onSettled: invalidate,
  });
}
