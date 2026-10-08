import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, tracking, usePalette, type Palette } from "../theme";

type Variant =
  | "display"
  | "title"
  | "heading"
  | "lead"
  | "body"
  | "bodyStrong"
  | "label"
  | "caption"
  | "mono";
type Tone =
  | "default"
  | "secondary"
  | "muted"
  | "faint"
  | "accent"
  | "positive"
  | "danger"
  | "onAccent";

/** Scale mirrors useautumn.com: Geist 400 at -4% for big type, Light at -2% for prose. */
const VARIANTS: Record<Variant, TextStyle> = {
  display: {
    fontFamily: fonts.regular,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: tracking(48, -4),
    fontVariant: ["tabular-nums"],
  },
  title: {
    fontFamily: fonts.regular,
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: tracking(30, -4),
  },
  heading: {
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: tracking(17, -2),
  },
  lead: { fontFamily: fonts.light, fontSize: 16, lineHeight: 22, letterSpacing: tracking(16, -2) },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: tracking(15, -1),
  },
  bodyStrong: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: tracking(15, -1),
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  caption: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: tracking(13, -1),
  },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 18, fontVariant: ["tabular-nums"] },
};

function toneColor(palette: Palette, tone: Tone): string {
  switch (tone) {
    case "default":
      return palette.text;
    case "secondary":
      return palette.textSecondary;
    case "muted":
      return palette.textMuted;
    case "faint":
      return palette.textFaint;
    case "accent":
      return palette.accentText;
    case "positive":
      return palette.positive;
    case "danger":
      return palette.danger;
    case "onAccent":
      return palette.onAccent;
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

const DEFAULT_TONE: Partial<Record<Variant, Tone>> = {
  label: "muted",
  caption: "muted",
  lead: "muted",
};

export type AppTextProps = TextProps & { readonly variant?: Variant; readonly tone?: Tone };

export function Text({ variant = "body", tone, style, ...rest }: AppTextProps) {
  const palette = usePalette();
  return (
    <RNText
      {...rest}
      style={[
        VARIANTS[variant],
        { color: toneColor(palette, tone ?? DEFAULT_TONE[variant] ?? "default") },
        style,
      ]}
    />
  );
}

/**
 * Autumn's two-tone headline: quiet words in 60% white, the key words in
 * full white. Pass parts in reading order.
 */
export function TwoTone({
  parts,
  variant = "title",
}: {
  readonly parts: readonly { readonly text: string; readonly strong?: boolean }[];
  readonly variant?: Variant;
}) {
  return (
    <Text variant={variant} accessibilityRole="header">
      {parts.map((part, index) => (
        <Text key={index} variant={variant} tone={part.strong ? "default" : "muted"}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}
