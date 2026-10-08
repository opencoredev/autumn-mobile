import { useRouter } from "expo-router";
import { View } from "react-native";
import {
  formatMoney,
  intervalSuffix,
  type Invoice,
  type Purchase,
  type Subscription,
} from "@autumn/shared";
import { initials, longDate, relativeTime } from "../lib/format";
import { space, usePalette } from "../theme";
import { Avatar, Row } from "./Row";
import { StatusLabel } from "./StatusLabel";
import { Text } from "./Text";

/**
 * Rows lead with the customer in org-wide lists. Inside a customer's own page
 * (`withinCustomer`) they lead with the plan instead, since the name repeats.
 */
export function SubscriptionRow({
  orgId,
  subscription,
  isLast,
  withinCustomer = false,
}: {
  readonly orgId: string;
  readonly subscription: Subscription;
  readonly isLast?: boolean;
  readonly withinCustomer?: boolean;
}) {
  const router = useRouter();
  const who = subscription.customerName ?? subscription.customerId;
  return (
    <Row
      {...(withinCustomer ? {} : { leading: <Avatar label={initials(who)} /> })}
      title={withinCustomer ? subscription.planName : who}
      subtitle={
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <StatusLabel status={subscription.status} />
          {withinCustomer ? null : (
            <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
              {subscription.planName}
            </Text>
          )}
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
  withinCustomer = false,
}: {
  readonly orgId: string;
  readonly invoice: Invoice;
  readonly isLast?: boolean;
  readonly withinCustomer?: boolean;
}) {
  const router = useRouter();
  const palette = usePalette();
  const who = invoice.customerName ?? invoice.customerId ?? "Unknown customer";
  const refunded = invoice.refunded > 0;
  const plans = invoice.planNames.length > 0 ? invoice.planNames.join(", ") : "Invoice";
  return (
    <Row
      {...(withinCustomer ? {} : { leading: <Avatar label={initials(who)} /> })}
      title={withinCustomer ? plans : who}
      subtitle={withinCustomer ? longDate(invoice.createdAt) : plans}
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
  withinCustomer = false,
}: {
  readonly orgId: string;
  readonly purchase: Purchase;
  readonly isLast?: boolean;
  readonly withinCustomer?: boolean;
}) {
  const router = useRouter();
  const who = purchase.customerName ?? purchase.customerId;
  return (
    <Row
      {...(withinCustomer ? {} : { leading: <Avatar label={initials(who)} /> })}
      title={withinCustomer ? purchase.planName : who}
      subtitle={withinCustomer ? longDate(purchase.startedAt) : purchase.planName}
      trailing={purchase.price ? formatMoney(purchase.price) : "Free"}
      trailingCaption={relativeTime(purchase.createdAt)}
      isLast={isLast ?? false}
      onPress={() =>
        router.push(`/org/${orgId}/customer/${encodeURIComponent(purchase.customerId)}`)
      }
    />
  );
}
