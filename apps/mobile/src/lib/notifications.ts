import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { PushDataSchema, type Org, type PushData } from "@autumn/shared";
import { api } from "./api";

export const SALES_SOUND = "cha_ching.wav";

export function orgChannelId(orgId: string): string {
  return `org-${orgId}`;
}

/**
 * While the app is open, sales show as an in-app toast with haptics and the
 * cha-ching sound instead of a system banner.
 */
export function configureForegroundHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const isSale = PushDataSchema.safeParse(notification.request.content.data).success;
      return {
        shouldShowBanner: !isSale,
        shouldShowList: true,
        shouldPlaySound: !isSale,
        shouldSetBadge: false,
      };
    },
  });
}

export function parsePushData(notification: Notifications.Notification): PushData | null {
  const parsed = PushDataSchema.safeParse(notification.request.content.data);
  return parsed.success ? parsed.data : null;
}

/** Android needs a channel per org, created before any push for it arrives. */
export async function syncOrgChannels(orgs: readonly Org[]): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelGroupAsync("sales", { name: "Sales" });
  const existing = await Notifications.getNotificationChannelsAsync();
  const wanted = new Set(orgs.map((org) => orgChannelId(org.id)));
  await Promise.all(
    orgs.map((org) =>
      Notifications.setNotificationChannelAsync(orgChannelId(org.id), {
        name: org.name,
        description: `Sales and subscription events for ${org.name}`,
        groupId: "sales",
        importance: Notifications.AndroidImportance.HIGH,
        sound: SALES_SOUND,
        vibrationPattern: [0, 60, 80, 120],
        lightColor: "#8F3CF8",
      }),
    ),
  );
  await Promise.all(
    existing
      .filter((channel) => channel.id.startsWith("org-") && !wanted.has(channel.id))
      .map((channel) => Notifications.deleteNotificationChannelAsync(channel.id)),
  );
}

export type PushRegistration =
  | { readonly kind: "registered"; readonly token: string }
  | { readonly kind: "denied" }
  | { readonly kind: "unsupported"; readonly reason: string };

function easProjectId(): string | null {
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== "object" || extra === null || !("eas" in extra)) return null;
  const eas: unknown = extra.eas;
  if (typeof eas !== "object" || eas === null || !("projectId" in eas)) return null;
  return typeof eas.projectId === "string" && eas.projectId.length > 0 ? eas.projectId : null;
}

let registeredToken: string | null = null;

export async function registerForPush(options: { prompt: boolean }): Promise<PushRegistration> {
  if (!Device.isDevice) return { kind: "unsupported", reason: "Push needs a physical device." };
  const projectId = easProjectId();
  if (!projectId) return { kind: "unsupported", reason: "Set an EAS project ID to enable push." };

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && options.prompt) {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return { kind: "denied" };

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.registerDevice({ expoPushToken: token, platform });
  registeredToken = token;
  return { kind: "registered", token };
}

export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  await api.unregisterDevice({ expoPushToken: registeredToken }).catch(() => undefined);
  registeredToken = null;
}

export function addSaleReceivedListener(handler: (data: PushData) => void): () => void {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = parsePushData(notification);
    if (data) handler(data);
  });
  return () => subscription.remove();
}

export function addSaleOpenedListener(handler: (data: PushData) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = parsePushData(response.notification);
    if (data) handler(data);
  });
  // A tap that cold-started the app arrives before the listener existed.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const data = parsePushData(response.notification);
    if (data) handler(data);
    void Notifications.clearLastNotificationResponseAsync();
  });
  return () => subscription.remove();
}
