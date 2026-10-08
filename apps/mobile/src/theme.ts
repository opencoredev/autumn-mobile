import { useColorScheme } from "react-native";

/**
 * Two sources, used where Autumn uses them:
 * - useautumn.com (brand): black canvas, square hairline frames, halftone
 *   texture, Geist headlines at -4%, Geist Mono `//` labels.
 * - Autumn's dashboard, github.com/useautumn/autumn packages/ui/src/styles
 *   (product data UI): primary #8838FF, text ramp #DDD/#CCC/#999/#767676,
 *   status-chip tones, sandbox blue, dashed chart grid.
 */

export const fonts = {
  light: "Geist_300Light",
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;

export type Palette = {
  readonly scheme: "dark" | "light";
  /** Page background, outside panels. */
  readonly background: string;
  /** Panels and cards. */
  readonly surface: string;
  /** Pressed rows, inputs, chips. */
  readonly elevated: string;
  /** Structural 1px lines. */
  readonly hairline: string;
  /** Hairlines on focus or emphasis. */
  readonly hairlineStrong: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textFaint: string;
  /** Brand purple: fills, buttons, active marks. */
  readonly accent: string;
  /** Purple tuned for text and strokes on the background. */
  readonly accentText: string;
  readonly accentSoft: string;
  /** Deep purple panel fill, as on the site's diagrams. */
  readonly accentDeep: string;
  readonly onAccent: string;
  readonly magenta: string;
  readonly positive: string;
  readonly trial: string;
  readonly warning: string;
  readonly danger: string;
  /** Neutral status tone (expired, draft). */
  readonly neutral: string;
  /** Scheduled status tone. */
  readonly scheduled: string;
  /** Refund status tone. */
  readonly amber: string;
  /** Dashboard's sandbox-environment blue. */
  readonly sandbox: string;
  /** Glyph color drawn on a status square. */
  readonly onStatus: string;
  /** Status chip fill and border (white/black at 4% and 6%). */
  readonly chip: string;
  readonly chipBorder: string;
  readonly skeleton: string;
};

const dark: Palette = {
  scheme: "dark",
  background: "#000000",
  surface: "#0A0A0A",
  elevated: "#161616",
  hairline: "#262626",
  hairlineStrong: "#333333",
  text: "#EDEDED",
  textSecondary: "#CCCCCC",
  textMuted: "#999999",
  // Dashboard "subtle": 4.6:1 on black, the floor for caption text.
  textFaint: "#767676",
  accent: "#8838FF",
  accentText: "#B07AFF",
  accentSoft: "rgba(136, 56, 255, 0.12)",
  accentDeep: "#1A0F33",
  onAccent: "#FFFFFF",
  magenta: "#D600EE",
  positive: "#30A46C",
  trial: "#3E8BD9",
  warning: "#E8742C",
  danger: "#E5484D",
  neutral: "#8A8A8A",
  scheduled: "#9A6BFF",
  amber: "#E5A21F",
  sandbox: "#0F9BFF",
  onStatus: "#0A0A0A",
  chip: "rgba(255, 255, 255, 0.04)",
  chipBorder: "rgba(255, 255, 255, 0.06)",
  skeleton: "#141414",
};

const light: Palette = {
  scheme: "light",
  background: "#FAFAF9",
  surface: "#FFFFFF",
  elevated: "#F3F3F2",
  hairline: "#E5E5E5",
  hairlineStrong: "#D1D1D1",
  text: "#121212",
  textSecondary: "#444444",
  textMuted: "#666666",
  // 5.2:1 on #FAFAF9; the dashboard's #767676 is 4.35:1 here.
  textFaint: "#6B6B6B",
  accent: "#8838FF",
  accentText: "#7A2EF0",
  accentSoft: "#F6F0FF",
  accentDeep: "#F9F5FF",
  onAccent: "#FFFFFF",
  magenta: "#B800CC",
  positive: "#30A46C",
  trial: "#3E8BD9",
  warning: "#E8742C",
  danger: "#E5484D",
  neutral: "#8A8A8A",
  scheduled: "#9A6BFF",
  amber: "#E5A21F",
  sandbox: "#0F9BFF",
  onStatus: "#FFFFFF",
  chip: "rgba(0, 0, 0, 0.04)",
  chipBorder: "rgba(0, 0, 0, 0.06)",
  skeleton: "#EFEFEE",
};

export function usePalette(): Palette {
  return useColorScheme() === "light" ? light : dark;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Dashboard radius: 6px for chips and inputs. Frames stay square, as on the site. */
export const radius = { chip: 6, glyph: 3.5 } as const;

/** Letter spacing as a fraction of font size, like the site's -4% / -2%. */
export function tracking(fontSize: number, percent: number): number {
  return (fontSize * percent) / 100;
}
