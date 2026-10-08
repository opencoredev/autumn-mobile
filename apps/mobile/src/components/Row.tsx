import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { space, usePalette } from "../theme";
import { PixelIcon } from "./PixelIcon";
import { Text } from "./Text";

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  trailingCaption,
  onPress,
  showChevron = false,
  isLast = false,
  accessibilityLabel,
}: {
  readonly leading?: ReactNode;
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly trailing?: ReactNode;
  readonly trailingCaption?: string;
  readonly onPress?: () => void;
  readonly showChevron?: boolean;
  readonly isLast?: boolean;
  readonly accessibilityLabel?: string;
}) {
  const palette = usePalette();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingLeft: space.lg,
        minHeight: 60,
      }}
    >
      {leading}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingVertical: 12,
          paddingRight: space.lg,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: palette.hairline,
          minHeight: 60,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          {typeof subtitle === "string" ? (
            <Text variant="caption" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}
        </View>
        {trailing !== undefined || trailingCaption !== undefined ? (
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            {typeof trailing === "string" ? <Text variant="mono">{trailing}</Text> : trailing}
            {trailingCaption ? (
              <Text variant="caption" tone="faint">
                {trailingCaption}
              </Text>
            ) : null}
          </View>
        ) : null}
        {showChevron ? <PixelIcon name="chevronRight" size={12} color={palette.textFaint} /> : null}
      </View>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => ({ backgroundColor: pressed ? palette.elevated : "transparent" })}
    >
      {content}
    </Pressable>
  );
}

export function Avatar({ label, tint }: { readonly label: string; readonly tint?: string }) {
  const palette = usePalette();
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: palette.elevated,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: palette.hairline,
      }}
    >
      <Text variant="label" style={{ color: tint ?? palette.textMuted, letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
  );
}
