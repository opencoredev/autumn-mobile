import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Linking, Platform, ScrollView, View } from "react-native";
import type { NotificationSettings } from "@autumn/shared";
import { Button } from "@/src/components/Button";
import { OrgMonogram } from "@/src/components/OrgSwitcherButton";
import { PixelIcon } from "@/src/components/PixelIcon";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { SkeletonRows } from "@/src/components/Skeleton";
import { ErrorState, errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { ToggleRow } from "@/src/components/ToggleRow";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { relativeTime } from "@/src/lib/format";
import { registerForPush, type PushRegistration } from "@/src/lib/notifications";
import { useActiveOrg, useOrgs } from "@/src/lib/orgs";
import { useNotificationSettings } from "@/src/lib/settings";
import { showMessageToast } from "@/src/lib/toast";
import { space, usePalette } from "@/src/theme";

type ToggleKey = Exclude<keyof NotificationSettings, "pushEnabled">;

const TOGGLES: { key: ToggleKey; title: string; description: string }[] = [
  {
    key: "purchases",
    title: "New one-time purchases",
    description: "Lifetime deals, top-ups and other one-off plans.",
  },
  {
    key: "subscriptions",
    title: "New subscriptions",
    description: "When a paid subscription starts, including trial conversions.",
  },
  { key: "trials", title: "New trials", description: "When someone starts a free trial." },
  { key: "renewals", title: "Subscription renewals", description: "Every renewal payment." },
  {
    key: "cancellations",
    title: "Subscription cancellations",
    description: "When a customer cancels.",
  },
  {
    key: "excludeFree",
    title: "Exclude free products",
    description: "Skip subscription, trial, renewal and cancellation alerts for free plans.",
  },
];

function PushPermission() {
  const palette = usePalette();
  const [registration, setRegistration] = useState<PushRegistration | null>(null);

  useEffect(() => {
    const check = () =>
      void registerForPush({ prompt: false })
        .then(setRegistration)
        .catch(() => undefined);
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  if (!registration || registration.kind === "registered") return null;
  return (
    <View style={{ marginHorizontal: space.lg, marginTop: space.md, gap: space.sm }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <PixelIcon name="bell" size={14} color={palette.warning} />
        <Text variant="caption" style={{ color: palette.warning, flex: 1 }}>
          {registration.kind === "denied"
            ? "Notifications are off for this device."
            : registration.reason}
        </Text>
      </View>
      {registration.kind === "denied" ? (
        <Button
          label="Turn on notifications"
          variant="secondary"
          onPress={() =>
            void registerForPush({ prompt: true }).then((next) => {
              setRegistration(next);
              if (next.kind === "denied" && Platform.OS !== "web") void Linking.openSettings();
            })
          }
        />
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { state, signOut } = useAuth();
  const { orgs } = useOrgs();
  const activeOrg = useActiveOrg();
  const { settings, isPending, error, update } = useNotificationSettings();

  const testPush = useMutation({
    mutationFn: () => api.sendTestPush(activeOrg.id),
    onSuccess: ({ sent }) =>
      showMessageToast(
        sent > 0
          ? `Sent to ${sent} ${sent === 1 ? "device" : "devices"}.`
          : "No devices registered yet.",
      ),
    onError: (caught) => showMessageToast(errorMessage(caught), "error"),
  });

  const user = state.kind === "signedIn" ? state.user : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    >
      <Section title="Push notifications">
        {isPending ? (
          <SkeletonRows count={3} />
        ) : !settings ? (
          <ErrorState error={error} />
        ) : (
          <>
            <ToggleRow
              title="Push notifications"
              description="Sales and subscription alerts on this account's devices."
              value={settings.pushEnabled}
              onChange={(next) => update({ pushEnabled: next })}
            />
            {TOGGLES.map((toggle, index) => (
              <ToggleRow
                key={toggle.key}
                title={toggle.title}
                description={toggle.description}
                value={settings[toggle.key]}
                disabled={!settings.pushEnabled}
                onChange={(next) => update({ [toggle.key]: next })}
                isLast={index === TOGGLES.length - 1}
              />
            ))}
          </>
        )}
      </Section>
      <PushPermission />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
        <Button
          label="Send a test notification"
          variant="secondary"
          loading={testPush.isPending}
          onPress={() => testPush.mutate()}
        />
        <Text variant="caption" tone="faint">
          Settings sync to every device you're signed in on.
        </Text>
      </View>

      <Section
        title="Organizations"
        action={{ label: "Manage", onPress: () => router.push("/orgs") }}
      >
        {orgs.map((org) => (
          <Row
            key={org.id}
            leading={<OrgMonogram name={org.name} size={28} />}
            title={org.name}
            subtitle={
              org.hasWebhookSecret
                ? org.lastWebhookAt
                  ? `Last event ${relativeTime(org.lastWebhookAt)}`
                  : "Webhook ready, no events yet"
                : "Notifications not set up"
            }
            trailing={
              <Text variant="mono" tone="faint">
                ••{org.keySuffix}
              </Text>
            }
            showChevron
            onPress={() => router.push(`/orgs/${org.id}`)}
          />
        ))}
        <Row
          leading={
            <View style={{ width: 28, alignItems: "center" }}>
              <PixelIcon name="plus" size={14} color={palette.accentText} />
            </View>
          }
          title="Add organization"
          isLast
          onPress={() => router.push("/orgs/new")}
        />
      </Section>

      <Section title="Account">
        <Row
          title={user?.displayName ?? "Signed in"}
          subtitle={
            user ? `Signed in with ${user.provider === "apple" ? "Apple" : "Google"}` : undefined
          }
        />
        <Row title="About" showChevron onPress={() => router.push("/about")} />
        <Row title="Sign out" isLast onPress={() => void signOut()} />
      </Section>

      <Text variant="caption" tone="faint" style={{ textAlign: "center", marginTop: space.xl }}>
        Unofficial, not affiliated with Autumn.
      </Text>
    </ScrollView>
  );
}
