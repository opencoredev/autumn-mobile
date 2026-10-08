import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationSettingsResponse,
  type UpdateNotificationSettingsRequest,
} from "@autumn/shared";
import { api } from "./api";
import { queryClient, queryKeys } from "./query";
import { showMessageToast } from "./toast";

function applyPatch(
  base: NotificationSettings,
  patch: UpdateNotificationSettingsRequest,
): NotificationSettings {
  return {
    pushEnabled: patch.pushEnabled ?? base.pushEnabled,
    purchases: patch.purchases ?? base.purchases,
    subscriptions: patch.subscriptions ?? base.subscriptions,
    trials: patch.trials ?? base.trials,
    renewals: patch.renewals ?? base.renewals,
    cancellations: patch.cancellations ?? base.cancellations,
    excludeFree: patch.excludeFree ?? base.excludeFree,
  };
}

/** Notification settings live on the server so they follow the user across devices. */
export function useNotificationSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.notificationSettings(),
    select: (response) => response.settings,
  });

  const mutation = useMutation({
    mutationFn: (patch: UpdateNotificationSettingsRequest) => api.updateNotificationSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });
      const previous = queryClient.getQueryData<NotificationSettingsResponse>(queryKeys.settings);
      const base = previous?.settings ?? DEFAULT_NOTIFICATION_SETTINGS;
      const next = applyPatch(base, patch);
      queryClient.setQueryData<NotificationSettingsResponse>(queryKeys.settings, {
        settings: next,
      });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.settings, context.previous);
      showMessageToast("Couldn't save that setting. Try again.", "error");
    },
    onSuccess: (response) => queryClient.setQueryData(queryKeys.settings, response),
  });

  return {
    settings: query.data ?? null,
    isPending: query.isPending,
    error: query.error,
    update: (patch: UpdateNotificationSettingsRequest) => mutation.mutate(patch),
  };
}
