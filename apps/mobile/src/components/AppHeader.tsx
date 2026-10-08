import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

/**
 * Stack header in Autumn's framing: square 44pt back target, Geist title,
 * hairline bottom rule. Replaces React Navigation's default header.
 */
export function AppHeader({
  title,
  canGoBack,
  onBack,
  modal = false,
}: {
  readonly title: string | undefined;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly modal?: boolean;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: modal ? 0 : insets.top,
        backgroundColor: palette.background,
        borderBottomWidth: 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: space.sm,
        }}
      >
        {canGoBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? palette.elevated : "transparent",
            })}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M19 12H5M11 6l-6 6 6 6"
                stroke={palette.text}
                strokeWidth={1.75}
                strokeLinecap="square"
                fill="none"
              />
            </Svg>
          </Pressable>
        ) : (
          <View style={{ width: space.sm }} />
        )}
        <Text variant="heading" numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>
          {title ?? ""}
        </Text>
      </View>
    </View>
  );
}
