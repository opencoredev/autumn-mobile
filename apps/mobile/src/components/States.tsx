import { View } from "react-native";
import { ApiError } from "@autumn/shared";
import { space, usePalette } from "../theme";
import { Button } from "./Button";
import { PixelIcon, type PixelIconName } from "./PixelIcon";
import { Text } from "./Text";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network":
        return "Can't reach the server. Check your connection.";
      case "invalid_autumn_key":
        return "Autumn rejected this org's secret key. Replace it in Settings.";
      case "autumn_unavailable":
        return "Autumn isn't responding right now. Pull to retry.";
      default:
        return error.message;
    }
  }
  return "Something went wrong.";
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
}) {
  return (
    <View style={{ padding: space.xl, gap: space.lg, alignItems: "flex-start" }}>
      <Text variant="body" tone="muted">
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({
  icon = "leaf",
  title,
  body,
}: {
  readonly icon?: PixelIconName;
  readonly title: string;
  readonly body?: string;
}) {
  const palette = usePalette();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingVertical: space.xl, gap: space.sm }}>
      <PixelIcon name={icon} size={20} color={palette.textFaint} />
      <Text variant="bodyStrong">{title}</Text>
      {body ? (
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      ) : null}
    </View>
  );
}
