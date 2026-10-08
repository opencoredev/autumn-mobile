import { View } from "react-native";
import type { SubscriptionStatus } from "@autumn/shared";
import { STATUS_LABEL } from "../lib/format";
import { usePalette, type Palette } from "../theme";
import { Text } from "./Text";

export function statusColor(palette: Palette, status: SubscriptionStatus): string {
  switch (status) {
    case "active":
      return palette.positive;
    case "trialing":
      return palette.trial;
    case "past_due":
      return palette.warning;
    case "canceling":
      return palette.pink;
    case "scheduled":
      return palette.textMuted;
    case "expired":
      return palette.textFaint;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function StatusLabel({ status }: { readonly status: SubscriptionStatus }) {
  const palette = usePalette();
  const color = statusColor(palette, status);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 6, height: 6, backgroundColor: color }} />
      <Text variant="label" style={{ color }}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}
