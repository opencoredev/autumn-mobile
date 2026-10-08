import { useMutation } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import type { Org } from "@autumn/shared";
import { Button } from "@/src/components/Button";
import { DetailRow } from "@/src/components/DetailRow";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { EmptyState, errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { TextField } from "@/src/components/TextField";
import { api } from "@/src/lib/api";
import { longDate, relativeTime } from "@/src/lib/format";
import { queryClient, queryKeys } from "@/src/lib/query";
import { useRouteOrg } from "@/src/lib/route-org";
import { showMessageToast } from "@/src/lib/toast";
import { space, usePalette } from "@/src/theme";

function replaceOrgInCache(org: Org) {
  queryClient.setQueryData<{ orgs: Org[] }>(queryKeys.orgs, (previous) => ({
    orgs: (previous?.orgs ?? []).map((existing) => (existing.id === org.id ? org : existing)),
  }));
}

export default function OrgScreen() {
  const org = useRouteOrg();
  if (!org) return <EmptyState title="Organization not found" />;
  return <OrgDetail org={org} />;
}

function OrgDetail({ org }: { readonly org: Org }) {
  const palette = usePalette();
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [newKey, setNewKey] = useState("");

  const rename = useMutation({
    mutationFn: () => api.renameOrg(org.id, name.trim()),
    onSuccess: ({ org: updated }) => {
      replaceOrgInCache(updated);
      showMessageToast("Name saved.");
    },
  });

  const replaceKey = useMutation({
    mutationFn: () => api.replaceOrgKey(org.id, newKey.trim()),
    onSuccess: ({ org: updated }) => {
      replaceOrgInCache(updated);
      setNewKey("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.org(org.id) });
      showMessageToast(`Key replaced. Now using ••${updated.keySuffix}.`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteOrg(org.id),
    onSuccess: () => {
      queryClient.setQueryData<{ orgs: Org[] }>(queryKeys.orgs, (previous) => ({
        orgs: (previous?.orgs ?? []).filter((existing) => existing.id !== org.id),
      }));
      queryClient.removeQueries({ queryKey: queryKeys.org(org.id) });
      router.back();
    },
    onError: (caught) => showMessageToast(errorMessage(caught), "error"),
  });

  const confirmRemove = () => {
    const message = `This deletes the stored key and webhook for ${org.name}. Nothing changes in Autumn.`;
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(message)) remove.mutate();
      return;
    }
    Alert.alert("Remove organization?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => remove.mutate() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <Stack.Screen options={{ title: org.name }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Notifications">
          <Row
            title="Webhook setup"
            subtitle={
              org.hasWebhookSecret
                ? org.lastWebhookAt
                  ? `Connected · last event ${relativeTime(org.lastWebhookAt)}`
                  : "Signing secret saved · waiting for first event"
                : "Not set up yet"
            }
            showChevron
            isLast
            onPress={() => router.push(`/orgs/${org.id}/webhook`)}
          />
        </Section>

        <Section title="Name">
          <View style={{ padding: space.lg, gap: space.md }}>
            <TextField
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={60}
              error={rename.isError ? errorMessage(rename.error) : null}
            />
            <Button
              label="Save name"
              variant="secondary"
              loading={rename.isPending}
              disabled={name.trim().length === 0 || name.trim() === org.name}
              onPress={() => rename.mutate()}
            />
          </View>
        </Section>

        <Section title="Secret key">
          <DetailRow
            label="Current key"
            value={`${org.keyEnv === "live" ? "am_sk_live" : "am_sk_test"}_••••${org.keySuffix}`}
            mono
          />
          <DetailRow label="Added" value={longDate(org.createdAt)} isLast />
          <View style={{ padding: space.lg, gap: space.md }}>
            <TextField
              label="Replace key"
              placeholder="am_sk_live_…"
              value={newKey}
              onChangeText={setNewKey}
              autoCapitalize="none"
              secureTextEntry
              mono
              textContentType="none"
              autoComplete="off"
              error={replaceKey.isError ? errorMessage(replaceKey.error) : null}
              hint="The new key is checked with a read-only call, then encrypted. The old one is discarded."
            />
            <Button
              label="Replace key"
              variant="secondary"
              loading={replaceKey.isPending}
              disabled={newKey.trim().length < 8}
              onPress={() => replaceKey.mutate()}
            />
          </View>
        </Section>

        <View style={{ padding: space.lg, gap: space.sm }}>
          <Button
            label="Remove organization"
            variant="destructive"
            loading={remove.isPending}
            onPress={confirmRemove}
          />
          <Text variant="caption" tone="faint">
            Removing only affects this app. Your data in Autumn stays as it is.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
