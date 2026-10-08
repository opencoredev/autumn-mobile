import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

export function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={{ marginTop: space.xl }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.lg,
          paddingBottom: space.sm,
          borderBottomWidth: 1,
          borderBottomColor: palette.hairline,
        }}
      >
        <Text variant="label">{title}</Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${title}`}
          >
            <Text variant="label" tone="accent">
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
