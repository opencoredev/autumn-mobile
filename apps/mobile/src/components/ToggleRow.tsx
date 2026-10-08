import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { selectionTick } from "../lib/celebrate";
import { space, usePalette } from "../theme";
import { Text } from "./Text";

const TRACK_W = 40;
const TRACK_H = 22;
const KNOB = 14;
const INSET = 3;

/** Square switch in Autumn's style: hairline track, square knob, purple when on. */
export function Toggle({
  value,
  disabled = false,
}: {
  readonly value: boolean;
  readonly disabled?: boolean;
}) {
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion ? (value ? 1 : 0) : withTiming(value ? 1 : 0, { duration: 150 });
  }, [value, progress, reduceMotion]);

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (TRACK_W - KNOB - INSET * 2 - 2) }],
  }));

  return (
    <View
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderWidth: 1,
        borderColor: value ? palette.accent : palette.hairlineStrong,
        backgroundColor: value ? palette.accent : palette.elevated,
        justifyContent: "center",
        paddingHorizontal: INSET,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Animated.View
        style={[
          {
            width: KNOB,
            height: KNOB,
            backgroundColor: value ? palette.onAccent : palette.textMuted,
          },
          knob,
        ]}
      />
    </View>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled = false,
  isLast = false,
}: {
  readonly title: string;
  readonly description?: string;
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly isLast?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={() => {
        selectionTick();
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => ({ backgroundColor: pressed ? palette.elevated : "transparent" })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.lg,
          marginLeft: space.lg,
          paddingRight: space.lg,
          paddingVertical: 14,
          minHeight: 60,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: palette.hairline,
        }}
      >
        <View style={{ flex: 1, gap: 3, opacity: disabled ? 0.45 : 1 }}>
          <Text variant="bodyStrong">{title}</Text>
          {description ? <Text variant="caption">{description}</Text> : null}
        </View>
        <Toggle value={value} disabled={disabled} />
      </View>
    </Pressable>
  );
}
