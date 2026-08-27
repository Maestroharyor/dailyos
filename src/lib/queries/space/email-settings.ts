"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  getSpaceEmailSettings,
  type SpaceEmailSettingsDTO,
  sendSpaceTestEmail,
  type UpdateEmailSettingsInput,
  updateSpaceEmailSettings,
} from "@/lib/actions/space/email-settings";
import { requireOnline } from "@/lib/offline/online-only";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";

export type { SpaceEmailSettingsDTO, UpdateEmailSettingsInput };

export interface EmailSettingsResponse {
  settings: SpaceEmailSettingsDTO;
}

export function useSpaceEmailSettings(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.system.emailSettings(spaceId),
    queryFn: () => unwrapAction(getSpaceEmailSettings(spaceId)),
    enabled: !!spaceId,
  });
}

export function useUpdateSpaceEmailSettings(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: UpdateEmailSettingsInput) => {
      // No optimistic update and no offline queue: the server decides what
      // `verifiedAt` becomes, and replaying a credential change out of the
      // outbox could resurrect a configuration the merchant already replaced.
      requireOnline("Changing email settings");
      return updateSpaceEmailSettings(spaceId, input);
    }),
    onError: (err) => notifyError(err, "Couldn't save email settings"),
    onSuccess: () => notifySuccess("Email settings saved"),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.system.emailSettings(spaceId),
      });
    },
  });
}

export function useSendSpaceTestEmail(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((to: string) => {
      requireOnline("Sending a test email");
      return sendSpaceTestEmail(spaceId, to);
    }),
    onError: (err) => notifyError(err, "Test email failed"),
    onSuccess: () => notifySuccess("Test email sent — your sender is now live"),
    onSettled: () => {
      // The send writes verifiedAt and lastError, so the card is stale either way.
      queryClient.invalidateQueries({
        queryKey: queryKeys.system.emailSettings(spaceId),
      });
    },
  });
}
