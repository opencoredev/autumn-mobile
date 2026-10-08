import { useCallback, useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import type { RevenueDay } from "@autumn/shared";
import { selectionTick } from "../lib/celebrate";
import { HalftoneGrid } from "./Halftone";
import { usePalette } from "../theme";

const HEIGHT = 168;
const TOP_PAD = 12;
const BOTTOM_PAD = 4;

type Point = { readonly x: number; readonly y: number };

export function buildPoints(days: readonly RevenueDay[], width: number): Point[] {
  if (days.length === 0 || width <= 0) return [];
  const max = Math.max(...days.map((day) => day.amount), 0);
  const usable = HEIGHT - TOP_PAD - BOTTOM_PAD;
  const step = days.length > 1 ? width / (days.length - 1) : 0;
  return days.map((day, index) => ({
    x: index * step,
    y: max > 0 ? TOP_PAD + usable - (Math.max(day.amount, 0) / max) * usable : HEIGHT - BOTTOM_PAD,
  }));
}

/**
 * Monotone cubic (Fritsch–Carlson) path: smooth like Polar's chart, but it
 * never overshoots, so a zero day never dips below the baseline.
 */
export function linePath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length < 3) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");
  }
  const count = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    slopes.push((b.y - a.y) / (b.x - a.x || 1));
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0] ?? 0;
    if (i === count - 1) return slopes[count - 2] ?? 0;
    const before = slopes[i - 1] ?? 0;
    const after = slopes[i] ?? 0;
    if (before * after <= 0) return 0;
    return (2 * before * after) / (before + after);
  });
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < count - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const dx = (b.x - a.x) / 3;
    const c1y = a.y + (tangents[i] ?? 0) * dx;
    const c2y = b.y - (tangents[i + 1] ?? 0) * dx;
    d += ` C${a.x + dx},${c1y} ${b.x - dx},${c2y} ${b.x},${b.y}`;
  }
  return d;
}

/**
 * 30-day revenue area chart. Drag across it to scrub; the parent shows the
 * scrubbed day's amount in place of the total.
 */
export function RevenueChart({
  days,
  onActiveIndexChange,
}: {
  readonly days: readonly RevenueDay[];
  readonly onActiveIndexChange: (index: number | null) => void;
}) {
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const points = useMemo(() => buildPoints(days, width), [days, width]);
  const line = useMemo(() => linePath(points), [points]);
  const area = useMemo(
    () => (points.length > 0 ? `${line} L${width},${HEIGHT} L0,${HEIGHT} Z` : ""),
    [line, points.length, width],
  );

  const update = useCallback(
    (index: number | null) => {
      setActiveIndex((previous) => {
        if (previous !== index && index !== null) selectionTick();
        return index;
      });
      onActiveIndexChange(index);
    },
    [onActiveIndexChange],
  );

  const count = days.length;
  const gesture = useMemo(() => {
    const indexAt = (x: number) => {
      "worklet";
      if (count < 2 || width <= 0) return 0;
      const raw = Math.round((x / width) * (count - 1));
      return Math.min(count - 1, Math.max(0, raw));
    };
    return (
      Gesture.Pan()
        // Horizontal drags scrub; vertical drags fall through to the page scroll.
        .activeOffsetX([-6, 6])
        .failOffsetY([-10, 10])
        .onStart((event) => {
          scheduleOnRN(update, indexAt(event.x));
        })
        .onUpdate((event) => {
          scheduleOnRN(update, indexAt(event.x));
        })
        .onFinalize(() => {
          scheduleOnRN(update, null);
        })
    );
  }, [count, width, update]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const active = activeIndex === null ? null : points[activeIndex];

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={onLayout}
        style={{ height: HEIGHT }}
        accessibilityRole="adjustable"
        accessibilityLabel="Revenue over the last 30 days. Drag to see each day."
      >
        {width > 0 ? (
          <Animated.View {...(reduceMotion ? {} : { entering: FadeIn.duration(280) })}>
            <Svg width={width} height={HEIGHT}>
              <Defs>
                {/* Autumn's halftone: magenta to violet, fading out, cut into pixels. */}
                <LinearGradient id="revenueFill" x1="0" y1="0" x2="0.35" y2="1">
                  <Stop offset="0" stopColor={palette.magenta} stopOpacity={1} />
                  <Stop offset="0.5" stopColor="#9A1BE6" stopOpacity={0.9} />
                  <Stop offset="1" stopColor="#5D04AF" stopOpacity={0.35} />
                </LinearGradient>
                <HalftoneGrid id="revenuePixels" color={palette.surface} />
              </Defs>
              <Line
                x1={0}
                x2={width}
                y1={HEIGHT - BOTTOM_PAD}
                y2={HEIGHT - BOTTOM_PAD}
                stroke={palette.hairline}
                strokeWidth={1}
              />
              {/* Dashed quarter lines, like the dashboard's chart grid (2 2). */}
              {[0.25, 0.5, 0.75].map((fraction) => (
                <Line
                  key={fraction}
                  x1={0}
                  x2={width}
                  y1={TOP_PAD + (HEIGHT - TOP_PAD - BOTTOM_PAD) * fraction}
                  y2={TOP_PAD + (HEIGHT - TOP_PAD - BOTTOM_PAD) * fraction}
                  stroke={palette.hairline}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              ))}
              {area ? <Path d={area} fill="url(#revenueFill)" /> : null}
              {area ? <Path d={area} fill="url(#revenuePixels)" /> : null}
              {line ? (
                <Path
                  d={line}
                  stroke={palette.scheme === "dark" ? "#E9B8FF" : palette.accentText}
                  strokeWidth={1.5}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {active ? (
                <>
                  <Line
                    x1={active.x}
                    x2={active.x}
                    y1={0}
                    y2={HEIGHT}
                    stroke={palette.textFaint}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  <Rect
                    x={active.x - 4}
                    y={active.y - 4}
                    width={8}
                    height={8}
                    fill={palette.surface}
                    stroke={palette.accentText}
                    strokeWidth={2}
                  />
                </>
              ) : null}
            </Svg>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}
