import { Pressable, View } from "react-native";
import { radius, space, usePalette } from "../theme";
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
        borderRadius: radius.md,
        backgroundColor: palette.surface,
        borderWidth: 1,
        borderColor: palette.hairline,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm + 1,
              backgroundColor: active ? palette.elevated : "transparent",
            }}
          >
            <Text variant="label" style={{ color: active ? palette.text : palette.textFaint }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
