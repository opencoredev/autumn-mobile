import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

/** `// SECTION` label in Geist Mono, as on useautumn.com. */
export function SectionLabel({ title }: { readonly title: string }) {
  return (
    <Text variant="label" accessibilityRole="header">
      <Text variant="label" tone="faint">
        {"// "}
      </Text>
      {title}
    </Text>
  );
}

/** A titled group of rows inside a hairline frame that runs edge to edge. */
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
          paddingHorizontal: space.md + 1,
          height: 40,
        }}
      >
        <SectionLabel title={title} />
        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}: ${title}`}
          >
            {({ pressed }) => (
              <Text variant="label" tone="accent" style={{ opacity: pressed ? 0.6 : 1 }}>
                {action.label} →
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
      <View
        style={{
          marginHorizontal: space.md,
          borderWidth: 1,
          borderColor: palette.hairline,
          backgroundColor: palette.surface,
        }}
      >
        {children}
      </View>
    </View>
  );
}
