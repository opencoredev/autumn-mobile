import { Tabs } from "expo-router/tabs";
import { OrgSwitcherButton } from "@/src/components/OrgSwitcherButton";
import { PixelIcon, type PixelIconName } from "@/src/components/PixelIcon";
import { fonts, usePalette } from "@/src/theme";

const TABS: { name: string; title: string; icon: PixelIconName }[] = [
  { name: "index", title: "Home", icon: "home" },
  { name: "customers", title: "Customers", icon: "customers" },
  { name: "catalogue", title: "Catalogue", icon: "catalogue" },
  { name: "settings", title: "Settings", icon: "settings" },
];

export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerShadowVisible: false,
        headerTitle: "",
        headerLeft: () => <OrgSwitcherButton />,
        headerLeftContainerStyle: { paddingLeft: 16 },
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.textFaint,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.hairline,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6 },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <PixelIcon name={tab.icon} size={20} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
