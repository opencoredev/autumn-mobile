import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

function ArrowIcon({ color }: { readonly color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M5 12h14M13 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="square"
        fill="none"
      />
    </Svg>
  );
}

type Variant = "primary" | "secondary" | "destructive" | "ghost";

/**
 * Autumn's CTA: a square block with a Geist Mono label and a small square
 * icon tile on the right ("Start for free  [→]").
 */
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
  /** Replaces the default arrow tile. */
  readonly icon?: ReactNode;
}) {
  const palette = usePalette();
  const fill =
    variant === "primary" ? palette.accent : variant === "ghost" ? "transparent" : palette.elevated;
  const textColor =
    variant === "primary"
      ? palette.onAccent
      : variant === "destructive"
        ? palette.danger
        : variant === "ghost"
          ? palette.accentText
          : palette.text;
  const tileFill = variant === "primary" ? "rgba(255, 255, 255, 0.9)" : palette.text;
  const tileIcon = variant === "primary" ? palette.accent : palette.background;
  const inactive = disabled || loading;
  const showTile = variant === "primary" || variant === "secondary";

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => ({
        height: 48,
        backgroundColor: fill,
        borderWidth: variant === "destructive" ? 1 : 0,
        borderColor: palette.hairline,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: showTile ? "space-between" : "center",
        paddingLeft: space.lg,
        paddingRight: showTile ? space.sm : space.lg,
        opacity: inactive ? 0.45 : 1,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Text variant="bodyStrong" style={{ color: textColor }}>
        {label}
      </Text>
      {showTile ? (
        <View
          style={{
            width: 32,
            height: 32,
            backgroundColor: tileFill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={tileIcon} />
          ) : (
            (icon ?? <ArrowIcon color={tileIcon} />)
          )}
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={textColor} style={{ marginLeft: space.sm }} />
      ) : null}
    </Pressable>
  );
}
