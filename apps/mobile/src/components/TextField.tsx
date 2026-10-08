import { TextInput, View, type TextInputProps } from "react-native";
import { fonts, radius, space, usePalette } from "../theme";
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
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <TextInput
        placeholderTextColor={palette.textFaint}
        selectionColor={palette.accent}
        autoCorrect={false}
        {...input}
        accessibilityLabel={label}
        style={{
          height: 50,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: error ? palette.danger : palette.hairline,
          backgroundColor: palette.surface,
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
