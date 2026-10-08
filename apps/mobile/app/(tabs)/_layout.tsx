import { Tabs } from "expo-router/tabs";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrgSwitcherButton } from "@/src/components/OrgSwitcherButton";
import { PixelIcon, type PixelIconName } from "@/src/components/PixelIcon";
import { Text } from "@/src/components/Text";
import { selectionTick } from "@/src/lib/celebrate";
import { usePalette } from "@/src/theme";

const TABS: { name: string; title: string; icon: PixelIconName }[] = [
  { name: "index", title: "Home", icon: "home" },
  { name: "customers", title: "Customers", icon: "customers" },
  { name: "catalogue", title: "Catalogue", icon: "catalogue" },
  { name: "settings", title: "Settings", icon: "settings" },
];

/** Square cells split by hairlines, mono labels, a purple bar on the active tab. */
function AutumnTabBar({ state, navigation }: BottomTabBarProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: palette.hairline,
        backgroundColor: palette.background,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((candidate) => candidate.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? palette.text : palette.textFaint;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.title}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                selectionTick();
                navigation.navigate(route.name);
              }
            }}
            style={({ pressed }) => ({
              flex: 1,
              height: 60,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderLeftWidth: index === 0 ? 0 : 1,
              borderLeftColor: palette.hairline,
              backgroundColor: pressed ? palette.elevated : "transparent",
            })}
          >
            <View
              style={{
                position: "absolute",
                top: -1,
                left: 0,
                right: 0,
                height: 2,
                backgroundColor: focused ? palette.accent : "transparent",
              }}
            />
            <PixelIcon name={tab.icon} size={18} color={focused ? palette.accentText : color} />
            <Text variant="label" style={{ color, fontSize: 10, letterSpacing: 1 }}>
              {tab.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      tabBar={(props) => <AutumnTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: palette.background,
          borderBottomWidth: 1,
          borderBottomColor: palette.hairline,
        },
        headerShadowVisible: false,
        headerTitle: "",
        headerLeft: () => <OrgSwitcherButton />,
        headerLeftContainerStyle: { paddingLeft: 16 },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
