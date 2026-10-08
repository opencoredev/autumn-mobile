import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/src/components/Button";
import { PixelIcon } from "@/src/components/PixelIcon";
import { errorMessage } from "@/src/components/States";
import { Halftone } from "@/src/components/Halftone";
import { Text, TwoTone } from "@/src/components/Text";
import { config } from "@/src/config";
import { api } from "@/src/lib/api";
import { isAppleSignInAvailable, signInWithApple } from "@/src/lib/apple-sign-in";
import { useAuth } from "@/src/lib/auth";
import { googleSignInAvailable, signInWithGoogle } from "@/src/lib/google-sign-in";
import { space, usePalette } from "@/src/theme";

type Pending = "google" | "apple" | "dev" | null;

function GoogleMark() {
  // Placeholder mark inside the button's icon tile. Swap in Google's official
  // "G" asset before store review (AUT-6).
  const palette = usePalette();
  return (
    <Text variant="bodyStrong" style={{ fontSize: 15, lineHeight: 18, color: palette.background }}>
      G
    </Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={["bottom"]}>
      <HeroPanel />
      <View style={{ flex: 1, paddingHorizontal: space.lg, justifyContent: "space-between" }}>
        <View style={{ gap: space.lg, paddingTop: space.xl }}>
          <View
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.sm,
              height: 26,
              borderWidth: 1,
              borderColor: palette.accent,
              backgroundColor: palette.accentSoft,
            }}
          >
            <Text variant="label" tone="accent">
              Unofficial
            </Text>
            <Text variant="label" tone="faint">
              ·
            </Text>
            <Text variant="label" tone="secondary">
              Dashboard for Autumn
            </Text>
          </View>
          <TwoTone
            parts={[
              { text: "Your " },
              { text: "billing", strong: true },
              { text: ", in your " },
              { text: "pocket.", strong: true },
            ]}
          />
          <Text variant="lead" style={{ maxWidth: 340 }}>
            Revenue, subscriptions and customers from Autumn, with a{" "}
            <Text variant="lead" tone="default">
              cha-ching
            </Text>{" "}
            every time someone pays.
          </Text>
        </View>

        <View style={{ gap: space.sm, paddingBottom: space.md }}>
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
              cornerRadius={0}
              style={{ height: 52, opacity: pending ? 0.5 : 1 }}
              onPress={() => void apple()}
            />
          ) : null}
          {googleSignInAvailable ? (
            <Button
              label="Continue with Google"
              variant={config.devLogin ? "secondary" : "primary"}
              icon={<GoogleMark />}
              loading={pending === "google"}
              disabled={pending !== null}
              onPress={() => void google()}
            />
          ) : null}
          {config.devLogin ? (
            <Button
              label="Continue with dev account"
              variant="primary"
              loading={pending === "dev"}
              disabled={pending !== null}
              onPress={() => void dev()}
            />
          ) : null}
          <Text variant="label" tone="faint" style={{ textAlign: "center", marginTop: space.sm }}>
            Not affiliated with Autumn
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const SAMPLE_SALES = [
  { title: "New subscription", plan: "Team", amount: "+$99.00" },
  { title: "New purchase", plan: "Lifetime", amount: "+$149.00" },
  { title: "Renewal", plan: "Pro", amount: "+$29.00" },
] as const;

/** The site's hero: halftone panel with a dark window card floating on it. */
function HeroPanel() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = insets.top + 260;
  return (
    <View style={{ height, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
      <Halftone width={width} height={height} gapColor="#0A0A0A" style={{ position: "absolute" }} />
      <View
        style={{
          position: "absolute",
          left: space.xl,
          right: space.xl,
          bottom: space.xl,
          borderWidth: 1,
          borderColor: "#292929",
          backgroundColor: "#0A0A0A",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: space.md,
            height: 34,
            borderBottomWidth: 1,
            borderBottomColor: "#292929",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View
              style={{
                width: 16,
                height: 16,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PixelIcon name="leaf" size={12} color="#000000" />
            </View>
            <Text variant="label" style={{ color: "#FFFFFF" }}>
              Autumn Dashboard
            </Text>
          </View>
          <Text variant="label" style={{ color: "rgba(255,255,255,0.52)" }}>
            Live
          </Text>
        </View>
        {SAMPLE_SALES.map((sale, index) => (
          <View
            key={sale.title}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.md,
              height: 36,
              borderBottomWidth: index === SAMPLE_SALES.length - 1 ? 0 : 1,
              borderBottomColor: "#171717",
            }}
          >
            <View
              style={{ width: 6, height: 6, backgroundColor: index === 0 ? "#9564FF" : "#3A3A3A" }}
            />
            <Text
              variant="mono"
              style={{ flex: 1, color: "rgba(255,255,255,0.72)", fontSize: 12 }}
              numberOfLines={1}
            >
              {sale.title} · {sale.plan}
            </Text>
            <Text variant="mono" style={{ color: "#18E299", fontSize: 12 }}>
              {sale.amount}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
