"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrapAction, wrapAction } from "@/lib/action-mutation";
import {
  getSpaceSmsSettings,
  refreshSpaceSmsBalance,
  type SpaceSmsSettingsDTO,
  sendSpaceTestSms,
  type UpdateSmsSettingsInput,
  updateSpaceSmsSettings,
} from "@/lib/actions/space/sms-settings";
import { requireOnline } from "@/lib/offline/online-only";
import { queryKeys } from "../keys";
import { notifyError, notifySuccess } from "../mutation-feedback";

export type { SpaceSmsSettingsDTO, UpdateSmsSettingsInput };

export interface SmsSettingsResponse {
  settings: SpaceSmsSettingsDTO;
}

export function useSpaceSmsSettings(spaceId: string) {
  return useQuery({
    queryKey: queryKeys.system.smsSettings(spaceId),
    queryFn: () => unwrapAction(getSpaceSmsSettings(spaceId)),
    enabled: !!spaceId,
  });
}

export function useUpdateSpaceSmsSettings(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((input: UpdateSmsSettingsInput) => {
      // No optimistic update and no offline queue, for the same reason as email
      // settings: the server decides what `verifiedAt` becomes, and replaying a
      // credential change out of the outbox could resurrect a configuration the
      // merchant already replaced.
      requireOnline("Changing SMS settings");
      return updateSpaceSmsSettings(spaceId, input);
    }),
    onError: (err) => notifyError(err, "Couldn't save SMS settings"),
    onSuccess: () => notifySuccess("SMS settings saved"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.smsSettings(spaceId) });
    },
  });
}

export function useSendSpaceTestSms(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction((to: string) => {
      requireOnline("Sending a test SMS");
      return sendSpaceTestSms(spaceId, to);
    }),
    onError: (err) => notifyError(err, "Test SMS failed"),
    onSuccess: () => notifySuccess("Test SMS sent. Your sender is now live"),
    onSettled: () => {
      // The send writes verifiedAt and lastError, so the card is stale either way.
      queryClient.invalidateQueries({ queryKey: queryKeys.system.smsSettings(spaceId) });
    },
  });
}

export function useRefreshSpaceSmsBalance(spaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: wrapAction(() => {
      requireOnline("Checking the SMS balance");
      return refreshSpaceSmsBalance(spaceId);
    }),
    onError: (err) => notifyError(err, "Couldn't read the SMS balance"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.system.smsSettings(spaceId) });
    },
  });
}
