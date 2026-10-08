import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  Easing,
  FadeOutUp,
  SlideInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney } from "@autumn/shared";
import { celebrate } from "../lib/celebrate";
import { useOrgs } from "../lib/orgs";
import { subscribeToToasts, type Toast } from "../lib/toast";
import { radius, space, usePalette } from "../theme";
import { PixelIcon } from "./PixelIcon";
import { Text } from "./Text";

const VISIBLE_MS = { sale: 5000, message: 3200 } as const;

/** One square of the pixel burst behind a sale toast. */
function ConfettiPixel({
  angle,
  distance,
  color,
  delay,
}: {
  readonly angle: number;
  readonly distance: number;
  readonly color: string;
  readonly delay: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(angle) * distance * progress.value },
      { translateY: Math.sin(angle) * distance * progress.value },
    ],
  }));
  return (
    <Animated.View
      style={[
        { position: "absolute", left: 24, top: 24, width: 5, height: 5, backgroundColor: color },
        style,
      ]}
    />
  );
}

function SaleToast({
  toast,
  onDone,
}: {
  readonly toast: Extract<Toast, { kind: "sale" }>;
  readonly onDone: () => void;
}) {
  const palette = usePalette();
  const router = useRouter();
  const { setActiveOrgId, orgs } = useOrgs();
  const reduceMotion = useReducedMotion();
  const colors = [palette.accent, palette.pink, palette.accentText, palette.trial];

  const open = () => {
    const org = orgs.find((candidate) => candidate.id === toast.data.orgId);
    if (org) setActiveOrgId(org.id);
    onDone();
    router.push(toast.data.path);
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${toast.data.title}. ${toast.data.body}. Open`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        backgroundColor: palette.elevated,
        borderWidth: 1,
        borderColor: palette.hairline,
      }}
    >
      <View style={{ width: 48, height: 48 }}>
        {reduceMotion
          ? null
          : Array.from({ length: 12 }, (_, index) => (
              <ConfettiPixel
                key={index}
                angle={(index / 12) * Math.PI * 2}
                distance={22 + (index % 3) * 8}
                color={colors[index % colors.length] ?? palette.accent}
                delay={(index % 4) * 30}
              />
            ))}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: palette.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <PixelIcon name="leaf" size={22} color={palette.accentText} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" tone="accent" numberOfLines={1}>
          {toast.data.orgName}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {toast.data.title}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          {toast.data.body}
        </Text>
      </View>
      {toast.data.amount ? (
        <Text variant="mono" tone="positive">
          +{formatMoney(toast.data.amount)}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      subscribeToToasts((next) => {
        if (timer.current) clearTimeout(timer.current);
        setToast(next);
        if (next.kind === "sale") celebrate();
        timer.current = setTimeout(() => setToast(null), VISIBLE_MS[next.kind]);
      }),
    [],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: insets.top + space.sm,
        left: space.md,
        right: space.md,
        zIndex: 100,
      }}
    >
      <Animated.View
        key={toast.id}
        entering={SlideInUp.springify().damping(18).stiffness(180)}
        exiting={FadeOutUp.duration(180)}
        accessibilityLiveRegion="polite"
      >
        {toast.kind === "sale" ? (
          <SaleToast toast={toast} onDone={() => setToast(null)} />
        ) : (
          <Pressable
            onPress={() => setToast(null)}
            accessibilityRole="alert"
            style={{
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: palette.elevated,
              borderWidth: 1,
              borderColor: toast.tone === "error" ? palette.danger : palette.hairline,
            }}
          >
            <Text variant="bodyStrong" tone={toast.tone === "error" ? "danger" : "default"}>
              {toast.text}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}
