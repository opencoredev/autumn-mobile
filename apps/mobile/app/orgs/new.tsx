import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import type { Org } from "@autumn/shared";
import { Button } from "@/src/components/Button";
import { errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { TextField } from "@/src/components/TextField";
import { api } from "@/src/lib/api";
import { useOrgs } from "@/src/lib/orgs";
import { queryClient, queryKeys } from "@/src/lib/query";
import { space, usePalette } from "@/src/theme";

export default function NewOrgScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { setActiveOrgId } = useOrgs();
  const [name, setName] = useState("");
  const [secretKey, setSecretKey] = useState("");

  const create = useMutation({
    mutationFn: () => api.createOrg({ name: name.trim(), secretKey: secretKey.trim() }),
    onSuccess: ({ org }) => {
      // Write the cache before navigating so the route guards see the new org.
      queryClient.setQueryData<{ orgs: Org[] }>(queryKeys.orgs, (previous) => ({
        orgs: [...(previous?.orgs ?? []).filter((existing) => existing.id !== org.id), org],
      }));
      setSecretKey("");
      setActiveOrgId(org.id);
      if (router.canDismiss()) router.dismissAll();
      router.push(`/orgs/${org.id}/webhook`);
    },
  });

  const canSubmit = name.trim().length > 0 && secretKey.trim().length >= 8 && !create.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.xl, gap: space.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="body" tone="muted">
          Use a secret key from Autumn's dashboard under Developer → API keys. The app only reads
          data; it never changes anything in Autumn.
        </Text>
        <TextField
          label="Name"
          placeholder="Acme (production)"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
          maxLength={60}
        />
        <TextField
          label="Secret key"
          placeholder="am_sk_live_…"
          value={secretKey}
          onChangeText={setSecretKey}
          autoCapitalize="none"
          secureTextEntry
          mono
          textContentType="none"
          autoComplete="off"
          importantForAutofill="no"
          error={create.isError ? errorMessage(create.error, "keyEntry") : null}
          hint="Encrypted on the server. It's never shown again; you'll only see its last four characters."
        />
        <View style={{ gap: space.sm }}>
          <Button
            label={create.isPending ? "Checking key…" : "Add organization"}
            loading={create.isPending}
            disabled={!canSubmit}
            onPress={() => create.mutate()}
          />
          <Text variant="caption" tone="faint" style={{ textAlign: "center" }}>
            We verify the key with a read-only request before saving it.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
