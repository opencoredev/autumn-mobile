import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/src/components/Button";
import { PixelIcon } from "@/src/components/PixelIcon";
import { errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { config } from "@/src/config";
import { api } from "@/src/lib/api";
import { isAppleSignInAvailable, signInWithApple } from "@/src/lib/apple-sign-in";
import { useAuth } from "@/src/lib/auth";
import { googleSignInAvailable, signInWithGoogle } from "@/src/lib/google-sign-in";
import { radius, space, usePalette } from "@/src/theme";

type Pending = "google" | "apple" | "dev" | null;

function GoogleMark() {
  // Placeholder monochrome mark. Swap in Google's official "G" asset before store review.
  const palette = usePalette();
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        backgroundColor: palette.scheme === "dark" ? "#FFFFFF" : "#171717",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        variant="bodyStrong"
        style={{
          fontSize: 13,
          lineHeight: 16,
          color: palette.scheme === "dark" ? "#171717" : "#FFFFFF",
        }}
      >
        G
      </Text>
    </View>
  );
}

export default function SignInScreen() {
  const palette = usePalette();
  const { completeSignIn } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function run(kind: Exclude<Pending, null>, task: () => Promise<void>) {
    setPending(kind);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(null);
    }
  }

  const google = () =>
    run("google", async () => {
      const result = await signInWithGoogle();
      if (result.kind === "cancelled") return;
      if (result.kind === "error") {
        setError(result.message);
        return;
      }
      await completeSignIn(await api.signInWithGoogle({ idToken: result.idToken }));
    });

  const apple = () =>
    run("apple", async () => {
      const result = await signInWithApple();
      if (result.kind === "cancelled") return;
      if (result.kind === "error") {
        setError(result.message);
        return;
      }
      await completeSignIn(
        await api.signInWithApple({
          identityToken: result.identityToken,
          displayName: result.displayName,
        }),
      );
    });

  const dev = () => run("dev", async () => completeSignIn(await api.devSignIn()));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, paddingHorizontal: space.xl, justifyContent: "space-between" }}>
        <View style={{ marginTop: 72, gap: space.xl }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.lg,
              backgroundColor: palette.scheme === "dark" ? palette.surface : "#000000",
              borderWidth: 1,
              borderColor: palette.hairline,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PixelIcon
              name="leaf"
              size={34}
              color={palette.scheme === "dark" ? palette.accentText : "#B48CFF"}
            />
          </View>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="accent">
              Autumn Dashboard
            </Text>
            <Text variant="title" style={{ fontSize: 32, lineHeight: 38, letterSpacing: -0.8 }}>
              Your billing,{"\n"}in your pocket.
            </Text>
            <Text variant="body" tone="muted" style={{ maxWidth: 320 }}>
              Revenue, subscriptions and customers from Autumn, with a cha-ching every time someone
              pays.
            </Text>
          </View>
        </View>

        <View style={{ gap: space.md, paddingBottom: space.lg }}>
          {error ? (
            <Text variant="caption" tone="danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {Platform.OS === "ios" && appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                palette.scheme === "dark"
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={{ height: 50, opacity: pending ? 0.5 : 1 }}
              onPress={() => void apple()}
            />
          ) : null}
          {googleSignInAvailable ? (
            <Button
              label="Continue with Google"
              variant="secondary"
              icon={<GoogleMark />}
              loading={pending === "google"}
              disabled={pending !== null}
              onPress={() => void google()}
            />
          ) : null}
          {config.devLogin ? (
            <Button
              label="Continue with dev account"
              variant="ghost"
              loading={pending === "dev"}
              disabled={pending !== null}
              onPress={() => void dev()}
            />
          ) : null}
          <Text variant="caption" tone="faint" style={{ textAlign: "center", marginTop: space.sm }}>
            Unofficial, not affiliated with Autumn.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
