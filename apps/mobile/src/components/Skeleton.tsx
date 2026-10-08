import { useEffect } from "react";
import { View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { radius, space, usePalette } from "../theme";

export function Skeleton({
  width,
  height,
  style,
}: {
  readonly width: DimensionValue;
  readonly height: number;
  readonly style?: ViewStyle;
}) {
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: palette.skeleton },
        animated,
        style,
      ]}
    />
  );
}

/** Placeholder rows shaped like `Row` so the layout doesn't jump when data lands. */
export function SkeletonRows({ count = 5 }: { readonly count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            paddingHorizontal: space.lg,
            paddingVertical: 14,
          }}
        >
          <Skeleton width={32} height={32} style={{ borderRadius: 8 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width={`${55 - (index % 3) * 10}%`} height={13} />
            <Skeleton width={`${35 - (index % 2) * 8}%`} height={11} />
          </View>
          <Skeleton width={52} height={13} />
        </View>
      ))}
    </View>
  );
}
