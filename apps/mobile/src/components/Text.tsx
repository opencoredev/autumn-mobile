import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { fonts, usePalette, type Palette } from "../theme";

type Variant =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "bodyStrong"
  | "label"
  | "caption"
  | "mono";
type Tone = "default" | "muted" | "faint" | "accent" | "positive" | "danger" | "onAccent";

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.monoMedium, fontSize: 40, lineHeight: 46, letterSpacing: -1.5 },
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
};

function toneColor(palette: Palette, tone: Tone): string {
  switch (tone) {
    case "default":
      return palette.text;
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

export type AppTextProps = TextProps & { readonly variant?: Variant; readonly tone?: Tone };

export function Text({ variant = "body", tone, style, ...rest }: AppTextProps) {
  const palette = usePalette();
  const defaultTone: Tone = variant === "label" || variant === "caption" ? "muted" : "default";
  return (
    <RNText
      {...rest}
      style={[VARIANTS[variant], { color: toneColor(palette, tone ?? defaultTone) }, style]}
    />
  );
}
