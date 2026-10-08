import { useId } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";
import { usePalette } from "../theme";

/** Pixel size of Autumn's halftone: 3px squares on a 4px grid. */
export const HALFTONE_CELL = 4;
export const HALFTONE_GAP = 1;

/**
 * The magenta-to-violet pixel texture from useautumn.com's hero. A diagonal
 * gradient with a grid of 1px gaps cut through it in `gapColor`.
 */
export function Halftone({
  width,
  height,
  gapColor,
  style,
}: {
  readonly width: number;
  readonly height: number;
  readonly gapColor?: string;
  readonly style?: ViewStyle;
}) {
  const palette = usePalette();
  const id = useId().replace(/:/g, "");
  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#D600EE" />
            <Stop offset="0.55" stopColor="#9A1BE6" />
            <Stop offset="1" stopColor="#5D04AF" />
          </LinearGradient>
          <HalftoneGrid id={`p${id}`} color={gapColor ?? palette.background} />
        </Defs>
        <Rect width={width} height={height} fill={`url(#g${id})`} />
        <Rect width={width} height={height} fill={`url(#p${id})`} />
      </Svg>
    </View>
  );
}

/** SVG pattern of grid gaps. Paint it over any fill to pixelate it. */
export function HalftoneGrid({ id, color }: { readonly id: string; readonly color: string }) {
  return (
    <Pattern id={id} width={HALFTONE_CELL} height={HALFTONE_CELL} patternUnits="userSpaceOnUse">
      <Rect
        x={HALFTONE_CELL - HALFTONE_GAP}
        y={0}
        width={HALFTONE_GAP}
        height={HALFTONE_CELL}
        fill={color}
      />
      <Rect
        x={0}
        y={HALFTONE_CELL - HALFTONE_GAP}
        width={HALFTONE_CELL}
        height={HALFTONE_GAP}
        fill={color}
      />
    </Pattern>
  );
}
