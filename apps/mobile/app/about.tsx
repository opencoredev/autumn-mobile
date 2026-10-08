import * as Application from "expo-application";
import { Linking, ScrollView, View } from "react-native";
import { DetailRow } from "@/src/components/DetailRow";
import { PixelIcon } from "@/src/components/PixelIcon";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { Text } from "@/src/components/Text";
import { space, usePalette } from "@/src/theme";

export default function AboutScreen() {
  const palette = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    >
      <View style={{ padding: space.lg, gap: space.lg }}>
        <View
          style={{
            width: 56,
            height: 56,
            backgroundColor: "#000000",
            borderWidth: 1,
            borderColor: palette.hairline,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PixelIcon name="leaf" size={30} color="#B48CFF" />
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="title">Autumn Dashboard</Text>
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: space.sm,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: palette.warning,
            }}
          >
            <Text variant="label" style={{ color: palette.warning }}>
              Unofficial · not affiliated with Autumn
            </Text>
          </View>
          <Text variant="body" tone="muted">
            An independent, read-only companion for Autumn billing. It is not made, endorsed or
            supported by Autumn. Autumn is a trademark of its owners.
          </Text>
        </View>
      </View>
      <Section title="How your data is handled">
        <DetailRow label="Autumn access" value="Read-only" />
        <DetailRow label="Secret keys" value="Encrypted on server" />
        <DetailRow label="Keys on this phone" value="Never stored" isLast />
      </Section>
      <Section title="Credits">
        <Row title="Cha-ching sound" subtitle="Synthesized for this app, CC0" isLast />
      </Section>
      <Section title="Links">
        <Row
          title="Autumn"
          subtitle="useautumn.com"
          showChevron
          isLast
          onPress={() => void Linking.openURL("https://useautumn.com")}
        />
      </Section>
      <Text variant="caption" tone="faint" style={{ textAlign: "center", marginTop: space.xl }}>
        Version {Application.nativeApplicationVersion ?? "0.1.0"}
      </Text>
    </ScrollView>
  );
}
