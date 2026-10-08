import { View } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

export function DetailRow({
  label,
  value,
  mono = false,
  isLast = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly isLast?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: space.lg,
        marginLeft: space.lg,
        paddingRight: space.lg,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: palette.hairline,
      }}
    >
      <Text variant="body" tone="muted">
        {label}
      </Text>
      <Text
        variant={mono ? "mono" : "body"}
        selectable
        numberOfLines={1}
        style={{ flexShrink: 1, textAlign: "right" }}
      >
        {value}
      </Text>
    </View>
  );
}
