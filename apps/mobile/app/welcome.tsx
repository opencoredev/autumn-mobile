import { useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/src/components/Button";
import { PixelIcon } from "@/src/components/PixelIcon";
import { Text } from "@/src/components/Text";
import { useAuth } from "@/src/lib/auth";
import { space, usePalette } from "@/src/theme";

const STEPS = [
  {
    title: "Add an organization",
    body: "Paste a secret key from Autumn. It's encrypted on the server and never sent back to this phone.",
  },
  {
    title: "See your numbers",
    body: "30-day revenue, subscriptions, orders, plans and customers, cached so they open instantly.",
  },
  {
    title: "Hear every sale",
    body: "Point an Autumn webhook at this app and get a cha-ching for each purchase and subscription.",
  },
];

export default function WelcomeScreen() {
  const palette = usePalette();
  const router = useRouter();
  const { state, signOut } = useAuth();
  const name = state.kind === "signedIn" ? state.user.displayName : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ flex: 1, padding: space.xl, justifyContent: "space-between" }}>
        <View style={{ gap: space.xl, marginTop: space.xxl }}>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="accent">
              {name ? `Welcome, ${name.split(" ")[0]}` : "Welcome"}
            </Text>
            <Text variant="title">Three steps to your dashboard</Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
            {STEPS.map((step, index) => (
              <View
                key={step.title}
                style={{
                  flexDirection: "row",
                  gap: space.lg,
                  paddingVertical: space.lg,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.hairline,
                }}
              >
                <Text variant="mono" tone="accent" style={{ width: 24 }}>
                  0{index + 1}
                </Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="bodyStrong">{step.title}</Text>
                  <Text variant="caption" tone="muted">
                    {step.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Button
            label="Add organization"
            icon={<PixelIcon name="plus" size={14} color={palette.onAccent} />}
            onPress={() => router.push("/orgs/new")}
          />
          <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>
    </SafeAreaView>
  );
}
