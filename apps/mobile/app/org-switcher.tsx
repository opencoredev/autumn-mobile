import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrgMonogram } from "@/src/components/OrgSwitcherButton";
import { PixelIcon } from "@/src/components/PixelIcon";
import { Text } from "@/src/components/Text";
import { selectionTick } from "@/src/lib/celebrate";
import { useOrgs } from "@/src/lib/orgs";
import { space, usePalette } from "@/src/theme";

export default function OrgSwitcherSheet() {
  const palette = usePalette();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgs, activeOrg, setActiveOrgId } = useOrgs();

  return (
    <View style={{ paddingTop: space.xl, paddingBottom: Math.max(insets.bottom, space.lg) }}>
      <Text variant="label" style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        Organizations
      </Text>
      {orgs.map((org) => {
        const active = org.id === activeOrg?.id;
        return (
          <Pressable
            key={org.id}
            onPress={() => {
              selectionTick();
              setActiveOrgId(org.id);
              router.back();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              backgroundColor: pressed ? palette.elevated : "transparent",
            })}
          >
            <OrgMonogram name={org.name} size={32} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {org.name}
              </Text>
              <Text variant="caption" tone="faint">
                {org.keyEnv === "live" ? "Live" : "Sandbox"} · ••{org.keySuffix}
              </Text>
            </View>
            {active ? <PixelIcon name="check" size={16} color={palette.accentText} /> : null}
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => {
          router.back();
          router.push("/orgs/new");
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          marginTop: space.xs,
          borderTopWidth: 1,
          borderTopColor: palette.hairline,
          backgroundColor: pressed ? palette.elevated : "transparent",
        })}
      >
        <View style={{ width: 32, alignItems: "center" }}>
          <PixelIcon name="plus" size={14} color={palette.accentText} />
        </View>
        <Text variant="bodyStrong" tone="accent">
          Add organization
        </Text>
      </Pressable>
    </View>
  );
}
