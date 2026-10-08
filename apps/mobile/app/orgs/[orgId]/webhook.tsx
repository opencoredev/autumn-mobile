import { useMutation, useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import type { Org } from "@autumn/shared";
import { Button } from "@/src/components/Button";
import { PixelIcon } from "@/src/components/PixelIcon";
import { EmptyState, errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { TextField } from "@/src/components/TextField";
import { api } from "@/src/lib/api";
import { selectionTick } from "@/src/lib/celebrate";
import { relativeTime } from "@/src/lib/format";
import { queryClient, queryKeys } from "@/src/lib/query";
import { useRouteOrg } from "@/src/lib/route-org";
import { showMessageToast } from "@/src/lib/toast";
import { radius, space, usePalette } from "@/src/theme";

const EVENTS = ["billing.updated", "invoice.finalized"] as const;

function Step({
  index,
  title,
  children,
}: {
  readonly index: number;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.lg,
        paddingVertical: space.lg,
        paddingRight: space.lg,
        marginLeft: space.lg,
        borderBottomWidth: 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <Text variant="mono" tone="accent" style={{ width: 22 }}>
        0{index}
      </Text>
      <View style={{ flex: 1, gap: space.sm }}>
        <Text variant="bodyStrong">{title}</Text>
        {children}
      </View>
    </View>
  );
}

/** Lets long URLs wrap after slashes instead of overflowing. Display only; copy uses the raw value. */
function breakable(value: string): string {
  return value.replace(/([/._-])/g, "$1\u200B");
}

function CopyBox({ value, label }: { readonly value: string; readonly label: string }) {
  const palette = usePalette();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      onPress={() => {
        void Clipboard.setStringAsync(value).then(() => {
          selectionTick();
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: copied ? palette.accent : palette.hairline,
        backgroundColor: pressed ? palette.elevated : palette.surface,
      })}
    >
      <Text variant="mono" style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18 }}>
        {breakable(value)}
      </Text>
      {copied ? (
        <Text variant="label" tone="accent">
          Copied
        </Text>
      ) : (
        <PixelIcon name="copy" size={14} color={palette.textMuted} />
      )}
    </Pressable>
  );
}

export default function WebhookSetupScreen() {
  const org = useRouteOrg();
  if (!org) return <EmptyState title="Organization not found" />;
  return <WebhookSetup org={org} />;
}

function WebhookSetup({ org }: { readonly org: Org }) {
  const palette = usePalette();
  const [secret, setSecret] = useState("");

  // Until the first event lands, poll so the status flips live when the user hits
  // "Send Test Event" in Autumn.
  useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => api.listOrgs(),
    refetchInterval: org.lastWebhookAt === null ? 4000 : false,
    refetchOnMount: "always",
  });

  const save = useMutation({
    mutationFn: () => api.setWebhookSecret(org.id, secret.trim()),
    onSuccess: ({ org: updated }) => {
      queryClient.setQueryData<{ orgs: Org[] }>(queryKeys.orgs, (previous) => ({
        orgs: (previous?.orgs ?? []).map((existing) =>
          existing.id === updated.id ? updated : existing,
        ),
      }));
      setSecret("");
      showMessageToast("Signing secret saved. Send a test event from Autumn.");
    },
  });

  const testPush = useMutation({
    mutationFn: () => api.sendTestPush(org.id),
    onSuccess: ({ sent }) =>
      showMessageToast(
        sent > 0
          ? "Test sent. Listen for the cha-ching."
          : "No devices registered yet. Allow notifications first.",
      ),
    onError: (caught) => showMessageToast(errorMessage(caught), "error"),
  });

  const status = org.lastWebhookAt
    ? { color: palette.positive, text: `Connected · last event ${relativeTime(org.lastWebhookAt)}` }
    : org.hasWebhookSecret
      ? { color: palette.warning, text: "Secret saved · waiting for the first event" }
      : { color: palette.textFaint, text: "Not connected yet" };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ padding: space.lg, gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 6, height: 6, backgroundColor: status.color }} />
            <Text variant="label" style={{ color: status.color }}>
              {status.text}
            </Text>
          </View>
          <Text variant="body" tone="muted">
            Autumn sends billing events to a webhook. Point one at this app and every sale for{" "}
            {org.name} reaches your phone.
          </Text>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Step index={1} title="Copy your webhook URL">
            <CopyBox value={org.webhookUrl} label="webhook URL" />
            <Text variant="caption" tone="faint">
              This URL is unique to {org.name}. Keep it private.
            </Text>
          </Step>
          <Step index={2} title="Add it in Autumn">
            <Text variant="caption" tone="muted">
              In the Autumn dashboard open Developer → Webhooks → Add Endpoint, paste the URL and
              subscribe to these events:
            </Text>
            <View style={{ gap: 6 }}>
              {EVENTS.map((event) => (
                <View
                  key={event}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
                >
                  <PixelIcon name="check" size={12} color={palette.accentText} />
                  <Text variant="mono" style={{ fontSize: 13 }}>
                    {event}
                  </Text>
                </View>
              ))}
            </View>
          </Step>
          <Step index={3} title="Paste the signing secret">
            <Text variant="caption" tone="muted">
              Autumn shows a signing secret for the endpoint. The server uses it to reject anything
              that didn't come from Autumn.
            </Text>
            <TextField
              label="Signing secret"
              placeholder="whsec_…"
              value={secret}
              onChangeText={setSecret}
              autoCapitalize="none"
              secureTextEntry
              mono
              textContentType="none"
              autoComplete="off"
              error={save.isError ? errorMessage(save.error) : null}
              {...(org.hasWebhookSecret
                ? { hint: "A secret is already saved. Paste a new one to replace it." }
                : {})}
            />
            <Button
              label={org.hasWebhookSecret ? "Replace secret" : "Save secret"}
              loading={save.isPending}
              disabled={!secret.trim().startsWith("whsec_")}
              onPress={() => save.mutate()}
            />
          </Step>
          <Step index={4} title="Test it">
            <Text variant="caption" tone="muted">
              Use Send Test Event in Autumn, or send a sample alert straight from here.
            </Text>
            <Button
              label="Send test notification"
              variant="secondary"
              loading={testPush.isPending}
              onPress={() => testPush.mutate()}
            />
          </Step>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
