import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { formatMoney, type FeatureBalance, type Org, type PaymentMethod } from "@autumn/shared";
import { DetailRow } from "@/src/components/DetailRow";
import { OrderRow, PurchaseRow, SubscriptionRow } from "@/src/components/rows";
import { Section } from "@/src/components/Section";
import { Skeleton, SkeletonRows } from "@/src/components/Skeleton";
import { EmptyState, ErrorState } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { api } from "@/src/lib/api";
import { longDate, shortDate } from "@/src/lib/format";
import { queryKeys } from "@/src/lib/query";
import { useRouteOrg, useRouteParam } from "@/src/lib/route-org";
import { usePullToRefresh } from "@/src/lib/use-refresh";
import { space, usePalette } from "@/src/theme";

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  us_bank_account: "Bank account",
  link: "Link",
};

function paymentLabel(method: PaymentMethod): string {
  const brand = BRANDS[method.brand] ?? method.brand;
  const last4 = method.last4 ? ` •• ${method.last4}` : "";
  const expiry =
    method.expMonth && method.expYear
      ? ` · ${String(method.expMonth).padStart(2, "0")}/${String(method.expYear).slice(-2)}`
      : "";
  return `${brand}${last4}${expiry}`;
}

const numberFormat = new Intl.NumberFormat("en-US");

/** Feature usage against allowance, as a square bar. */
function BalanceRow({
  balance,
  isLast,
}: {
  readonly balance: FeatureBalance;
  readonly isLast: boolean;
}) {
  const palette = usePalette();
  const fraction =
    balance.unlimited || balance.granted <= 0 ? 0 : Math.min(1, balance.usage / balance.granted);
  const barColor = fraction >= 0.9 ? palette.warning : palette.accent;
  return (
    <View
      style={{
        marginLeft: space.lg,
        paddingRight: space.lg,
        paddingVertical: 14,
        gap: 8,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: palette.hairline,
      }}
      accessibilityLabel={
        balance.unlimited
          ? `${balance.featureName}: unlimited, ${balance.usage} used`
          : `${balance.featureName}: ${balance.usage} of ${balance.granted} used`
      }
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: space.md,
        }}
      >
        <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {balance.featureName}
        </Text>
        <Text variant="mono" style={{ fontSize: 13 }}>
          {numberFormat.format(balance.usage)}
          <Text variant="mono" tone="muted" style={{ fontSize: 13 }}>
            {balance.unlimited ? " used" : ` / ${numberFormat.format(balance.granted)}`}
          </Text>
        </Text>
      </View>
      {balance.unlimited ? null : (
        <View style={{ height: 4, backgroundColor: palette.elevated }}>
          <View style={{ height: 4, width: `${fraction * 100}%`, backgroundColor: barColor }} />
        </View>
      )}
      <Text variant="caption">
        {balance.unlimited
          ? "Unlimited"
          : balance.nextResetAt
            ? `${numberFormat.format(balance.remaining)} left · resets ${shortDate(balance.nextResetAt)}`
            : `${numberFormat.format(balance.remaining)} left`}
      </Text>
    </View>
  );
}

export default function CustomerScreen() {
  const org = useRouteOrg();
  const customerId = useRouteParam("customerId");
  if (!org || !customerId) {
    return (
      <EmptyState
        title="Customer not found"
        body="The organization may have been removed from this app."
      />
    );
  }
  return <CustomerDetail org={org} customerId={customerId} />;
}

function CustomerDetail({ org, customerId }: { readonly org: Org; readonly customerId: string }) {
  const palette = usePalette();
  const query = useQuery({
    queryKey: queryKeys.customer(org.id, customerId),
    queryFn: () => api.customer(org.id, customerId),
  });
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);
  const data = query.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.textMuted}
        />
      }
    >
      <Stack.Screen options={{ title: data?.customer.name ?? "Customer" }} />
      {!data ? (
        query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <View style={{ padding: space.lg, gap: space.md }}>
            <Skeleton width={200} height={28} />
            <Skeleton width={140} height={14} />
            <View style={{ height: space.lg }} />
            <SkeletonRows count={4} />
          </View>
        )
      ) : (
        <>
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: 6 }}>
            <Text variant="label">{org.name}</Text>
            <Text variant="title">{data.customer.name ?? data.customer.id}</Text>
            <Text variant="label" tone="faint">
              Lifetime value
            </Text>
            <Text variant="display" style={{ fontSize: 32, lineHeight: 38 }}>
              {data.lifetimeValue.length > 0
                ? data.lifetimeValue.map((money) => formatMoney(money)).join(" + ")
                : formatMoney({ amount: 0, currency: "USD" })}
            </Text>
          </View>

          {data.balances.length > 0 ? (
            <Section title="Usage">
              {data.balances.map((balance, index) => (
                <BalanceRow
                  key={balance.featureId}
                  balance={balance}
                  isLast={index === data.balances.length - 1}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Subscriptions">
            {data.subscriptions.length === 0 ? (
              <EmptyState title="No subscriptions" />
            ) : (
              data.subscriptions.map((subscription, index) => (
                <SubscriptionRow
                  key={subscription.id}
                  orgId={org.id}
                  subscription={subscription}
                  withinCustomer
                  isLast={index === data.subscriptions.length - 1}
                />
              ))
            )}
          </Section>

          {data.purchases.length > 0 ? (
            <Section title="One-time purchases">
              {data.purchases.map((purchase, index) => (
                <PurchaseRow
                  key={purchase.id}
                  orgId={org.id}
                  purchase={purchase}
                  withinCustomer
                  isLast={index === data.purchases.length - 1}
                />
              ))}
            </Section>
          ) : null}

          <Section title="Invoices">
            {data.invoices.length === 0 ? (
              <EmptyState title="No invoices" />
            ) : (
              data.invoices.map((invoice, index) => (
                <OrderRow
                  key={invoice.id}
                  orgId={org.id}
                  invoice={invoice}
                  withinCustomer
                  isLast={index === data.invoices.length - 1}
                />
              ))
            )}
          </Section>

          <Section title="Details">
            <DetailRow label="Customer ID" value={data.customer.id} mono />
            {data.customer.stripeId ? (
              <DetailRow label="Stripe ID" value={data.customer.stripeId} mono />
            ) : null}
            {data.paymentMethod ? (
              <DetailRow label="Payment method" value={paymentLabel(data.paymentMethod)} mono />
            ) : null}
            <DetailRow
              label="Environment"
              value={data.customer.env === "live" ? "Live" : "Sandbox"}
            />
            <DetailRow label="Created" value={longDate(data.customer.createdAt)} isLast />
          </Section>
        </>
      )}
    </ScrollView>
  );
}
