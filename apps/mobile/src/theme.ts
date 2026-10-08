import { useColorScheme } from "react-native";

/**
 * Direction: Polar's calm dark ledger meets Autumn's own site. Black surfaces,
 * hairline rules instead of shadowed cards, Autumn purple as the single accent,
 * Geist for UI and Geist Mono (tabular) for every number and label.
 */

export const fonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
  monoSemibold: "GeistMono_600SemiBold",
} as const;

export type Palette = {
  readonly scheme: "dark" | "light";
  readonly background: string;
  readonly surface: string;
  readonly elevated: string;
  readonly hairline: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textFaint: string;
  readonly accent: string;
  /** Accent tuned for text and thin strokes on the background. */
  readonly accentText: string;
  readonly accentSoft: string;
  readonly onAccent: string;
  readonly pink: string;
  readonly positive: string;
  readonly trial: string;
  readonly warning: string;
  readonly danger: string;
  readonly skeleton: string;
};

const dark: Palette = {
  scheme: "dark",
  background: "#000000",
  surface: "#0F0F0F",
  elevated: "#1C1C1C",
  hairline: "#232323",
  text: "#EDEDED",
  textMuted: "#A1A1A1",
  // 4.6:1 on black: the faintest text still readable at caption size.
  textFaint: "#7A7A7A",
  accent: "#8F3CF8",
  accentText: "#B48CFF",
  accentSoft: "rgba(143, 60, 248, 0.16)",
  onAccent: "#FFFFFF",
  pink: "#F860C4",
  positive: "#4ADE80",
  trial: "#8080F5",
  warning: "#FBBF24",
  danger: "#FF5C8A",
  skeleton: "#161616",
};

const light: Palette = {
  scheme: "light",
  background: "#FAFAFA",
  surface: "#FFFFFF",
  elevated: "#F2F2F2",
  hairline: "#E6E6E6",
  text: "#171717",
  textMuted: "#5C5C5C",
  textFaint: "#6B6B6B",
  accent: "#7C3AED",
  accentText: "#6D28D9",
  accentSoft: "rgba(124, 58, 237, 0.1)",
  onAccent: "#FFFFFF",
  pink: "#EC0267",
  positive: "#15803D",
  trial: "#4040F0",
  warning: "#B45309",
  danger: "#D9044F",
  skeleton: "#EDEDED",
};

export function usePalette(): Palette {
  return useColorScheme() === "light" ? light : dark;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;
