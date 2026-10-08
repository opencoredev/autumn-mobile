import { ActivityIndicator, Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { radius, space, usePalette } from "../theme";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: Variant;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
}) {
  const palette = usePalette();
  const background =
    variant === "primary"
      ? palette.accent
      : variant === "secondary"
        ? palette.elevated
        : "transparent";
  const textColor =
    variant === "primary"
      ? palette.onAccent
      : variant === "destructive"
        ? palette.danger
        : variant === "ghost"
          ? palette.accentText
          : palette.text;
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => ({
        height: 50,
        borderRadius: radius.md,
        backgroundColor: background,
        borderWidth: variant === "secondary" || variant === "destructive" ? 1 : 0,
        borderColor: palette.hairline,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.lg,
        opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {loading ? <ActivityIndicator size="small" color={textColor} /> : icon}
        <Text variant="bodyStrong" style={{ color: textColor }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
