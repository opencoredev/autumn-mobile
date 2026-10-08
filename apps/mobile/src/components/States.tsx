import { View } from "react-native";
import { ApiError } from "@autumn/shared";
import { space, usePalette } from "../theme";
import { Button } from "./Button";
import { PixelIcon, type PixelIconName } from "./PixelIcon";
import { Text } from "./Text";

/**
 * `keyEntry` is for forms where the user just typed a key, so a rejected key
 * means "this key", not "the saved key".
 */
export function errorMessage(error: unknown, context: "default" | "keyEntry" = "default"): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "network":
        return "Can't reach the server. Check your connection.";
      case "invalid_autumn_key":
        return context === "keyEntry"
          ? "Autumn didn't accept this key. Copy a secret key (am_sk_…) from Autumn and try again."
          : "Autumn rejected this org's saved key. Replace it under Settings → Organizations.";
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
