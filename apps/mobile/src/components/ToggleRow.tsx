import { Switch, View } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

export function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled = false,
  isLast = false,
}: {
  readonly title: string;
  readonly description?: string;
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly isLast?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        marginLeft: space.lg,
        paddingRight: space.lg,
        paddingVertical: 12,
        minHeight: 56,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: palette.hairline,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: palette.elevated, true: palette.accent }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={palette.elevated}
      />
    </View>
  );
}
