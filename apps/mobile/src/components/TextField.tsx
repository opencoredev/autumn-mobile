import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { fonts, space, usePalette } from "../theme";
import { Text } from "./Text";

export function TextField({
  label,
  hint,
  error,
  mono = false,
  ...input
}: TextInputProps & {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly mono?: boolean;
}) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <TextInput
        placeholderTextColor={palette.textFaint}
        selectionColor={palette.accent}
        autoCorrect={false}
        {...input}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        accessibilityLabel={label}
        style={{
          height: 50,
          borderWidth: 1,
          borderColor: error ? palette.danger : focused ? palette.accent : palette.hairlineStrong,
          outlineWidth: 0,
          backgroundColor: palette.background,
          paddingHorizontal: space.md,
          color: palette.text,
          fontFamily: mono ? fonts.mono : fonts.regular,
          fontSize: mono ? 14 : 16,
        }}
      />
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
