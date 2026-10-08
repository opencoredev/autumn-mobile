import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

const TICK = 10;

/** The L-shaped corner marks Autumn puts on framed cards. */
export function CornerTicks({ color }: { readonly color?: string }) {
  const palette = usePalette();
  const tick = color ?? palette.textMuted;
  const arm = { position: "absolute", backgroundColor: tick } as const;
  return (
    <>
      <View style={[arm, { top: -1, left: -1, width: TICK, height: 1 }]} />
      <View style={[arm, { top: -1, left: -1, width: 1, height: TICK }]} />
      <View style={[arm, { top: -1, right: -1, width: TICK, height: 1 }]} />
      <View style={[arm, { top: -1, right: -1, width: 1, height: TICK }]} />
      <View style={[arm, { bottom: -1, left: -1, width: TICK, height: 1 }]} />
      <View style={[arm, { bottom: -1, left: -1, width: 1, height: TICK }]} />
      <View style={[arm, { bottom: -1, right: -1, width: TICK, height: 1 }]} />
      <View style={[arm, { bottom: -1, right: -1, width: 1, height: TICK }]} />
    </>
  );
}

/** A "■ LABEL" tab sitting on a panel's top edge, as on the site's diagrams. */
export function PanelTab({
  label,
  tone = "accent",
}: {
  readonly label: string;
  readonly tone?: "accent" | "plain";
}) {
  const palette = usePalette();
  const color = tone === "accent" ? palette.accent : palette.hairlineStrong;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: space.sm,
        height: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        borderColor: color,
        backgroundColor: tone === "accent" ? palette.accentDeep : palette.surface,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          backgroundColor: tone === "accent" ? palette.accentText : palette.textMuted,
        }}
      />
      <Text variant="label" tone={tone === "accent" ? "default" : "muted"}>
        {label}
      </Text>
    </View>
  );
}

/** Square, hairline-framed surface. */
export function Panel({
  children,
  tab,
  ticks = false,
  tone = "plain",
  padded = false,
  style,
}: {
  readonly children: ReactNode;
  readonly tab?: string;
  readonly ticks?: boolean;
  readonly tone?: "plain" | "accent";
  readonly padded?: boolean;
  readonly style?: ViewStyle;
}) {
  const palette = usePalette();
  const border = tone === "accent" ? palette.accent : palette.hairline;
  return (
    <View style={style}>
      {tab ? <PanelTab label={tab} tone={tone === "accent" ? "accent" : "plain"} /> : null}
      <View
        style={{
          borderWidth: 1,
          borderColor: border,
          backgroundColor: tone === "accent" ? palette.accentDeep : palette.surface,
          ...(padded ? { padding: space.lg } : {}),
        }}
      >
        {children}
        {ticks ? <CornerTicks color={palette.textMuted} /> : null}
      </View>
    </View>
  );
}

/** Three stacked hairlines, the site's band between sections. */
export function RuleBand() {
  const palette = usePalette();
  return (
    <View
      style={{ gap: 5, paddingVertical: space.sm }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {[0, 1, 2].map((index) => (
        <View key={index} style={{ height: 1, backgroundColor: palette.hairline }} />
      ))}
    </View>
  );
}
