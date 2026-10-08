import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useOrgs } from "../lib/orgs";
import { space, usePalette } from "../theme";
import { PixelIcon } from "./PixelIcon";
import { Text } from "./Text";

export function OrgMonogram({
  name,
  size = 24,
}: {
  readonly name: string;
  readonly size?: number;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: palette.accentSoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="label" tone="accent" style={{ fontSize: size * 0.45, letterSpacing: 0 }}>
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </Text>
    </View>
  );
}

/** Header control showing the active org; opens the switcher sheet. */
export function OrgSwitcherButton() {
  const palette = usePalette();
  const router = useRouter();
  const { activeOrg, orgs } = useOrgs();
  if (!activeOrg) return null;
  return (
    <Pressable
      onPress={() => router.push("/org-switcher")}
      accessibilityRole="button"
      accessibilityLabel={`Organization: ${activeOrg.name}. Switch organization`}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: 6,
        paddingHorizontal: space.sm,
        marginLeft: -space.sm,
        borderRadius: 8,
        backgroundColor: pressed ? palette.elevated : "transparent",
      })}
    >
      <OrgMonogram name={activeOrg.name} />
      <Text variant="heading" numberOfLines={1} style={{ maxWidth: 200 }}>
        {activeOrg.name}
      </Text>
      {activeOrg.keyEnv === "sandbox" ? (
        <Text variant="label" style={{ color: palette.warning }}>
          Sandbox
        </Text>
      ) : null}
      {orgs.length > 0 ? (
        <PixelIcon name="chevronDown" size={12} color={palette.textMuted} />
      ) : null}
    </Pressable>
  );
}
