import { Pressable, View } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (next: T) => void;
}) {
  const palette = usePalette();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        marginHorizontal: space.lg,
        marginVertical: space.sm,
        padding: 3,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.hairline,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            hitSlop={{ top: 4, bottom: 4 }}
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? palette.accent : "transparent",
            }}
          >
            <Text variant="label" style={{ color: active ? palette.onAccent : palette.textMuted }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
