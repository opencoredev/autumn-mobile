import { useRouter } from "expo-router";
import { View } from "react-native";
import {
  formatMoney,
  intervalSuffix,
  type Invoice,
  type Purchase,
  type Subscription,
} from "@autumn/shared";
import { initials, relativeTime } from "../lib/format";
import { space, usePalette } from "../theme";
import { Avatar, Row } from "./Row";
import { StatusLabel } from "./StatusLabel";
import { Text } from "./Text";

export function SubscriptionRow({
  orgId,
  subscription,
  isLast,
}: {
  readonly orgId: string;
  readonly subscription: Subscription;
  readonly isLast?: boolean;
}) {
  const router = useRouter();
  const who = subscription.customerName ?? subscription.customerId;
  return (
    <Row
      leading={<Avatar label={initials(who)} />}
      title={who}
      subtitle={
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <StatusLabel status={subscription.status} />
          <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
            {subscription.planName}
          </Text>
        </View>
      }
      trailing={
        subscription.price
          ? `${formatMoney(subscription.price)}${intervalSuffix(subscription.interval)}`
          : "Free"
      }
      trailingCaption={relativeTime(subscription.createdAt)}
      isLast={isLast ?? false}
      onPress={() =>
        router.push(`/org/${orgId}/customer/${encodeURIComponent(subscription.customerId)}`)
      }
    />
  );
}

export function OrderRow({
  orgId,
  invoice,
  isLast,
}: {
  readonly orgId: string;
  readonly invoice: Invoice;
  readonly isLast?: boolean;
}) {
  const router = useRouter();
  const palette = usePalette();
  const who = invoice.customerName ?? invoice.customerId ?? "Unknown customer";
  const refunded = invoice.refunded > 0;
  return (
    <Row
      leading={<Avatar label={initials(who)} />}
      title={who}
      subtitle={invoice.planNames.length > 0 ? invoice.planNames.join(", ") : "Invoice"}
      trailing={
        <Text
          variant="mono"
          style={{
            color: invoice.status === "paid" ? palette.text : palette.textMuted,
            textDecorationLine: refunded ? "line-through" : "none",
          }}
        >
          {formatMoney(invoice.total)}
        </Text>
      }
      trailingCaption={invoice.status === "paid" ? relativeTime(invoice.createdAt) : invoice.status}
      isLast={isLast ?? false}
      onPress={() => router.push(`/org/${orgId}/order/${encodeURIComponent(invoice.id)}`)}
    />
  );
}

export function PurchaseRow({
  orgId,
  purchase,
  isLast,
}: {
  readonly orgId: string;
  readonly purchase: Purchase;
  readonly isLast?: boolean;
}) {
  const router = useRouter();
  const who = purchase.customerName ?? purchase.customerId;
  return (
    <Row
      leading={<Avatar label={initials(who)} />}
      title={who}
      subtitle={purchase.planName}
      trailing={purchase.price ? formatMoney(purchase.price) : "Free"}
      trailingCaption={relativeTime(purchase.createdAt)}
      isLast={isLast ?? false}
      onPress={() =>
        router.push(`/org/${orgId}/customer/${encodeURIComponent(purchase.customerId)}`)
      }
    />
  );
}
