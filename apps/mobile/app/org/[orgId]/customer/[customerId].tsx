import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { formatMoney, type Org } from "@autumn/shared";
import { DetailRow } from "@/src/components/DetailRow";
import { OrderRow, PurchaseRow, SubscriptionRow } from "@/src/components/rows";
import { Section } from "@/src/components/Section";
import { Skeleton, SkeletonRows } from "@/src/components/Skeleton";
import { EmptyState, ErrorState } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { api } from "@/src/lib/api";
import { longDate } from "@/src/lib/format";
import { queryKeys } from "@/src/lib/query";
import { useRouteOrg, useRouteParam } from "@/src/lib/route-org";
import { usePullToRefresh } from "@/src/lib/use-refresh";
import { space, usePalette } from "@/src/theme";

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

          <Section title="Subscriptions">
            {data.subscriptions.length === 0 ? (
              <EmptyState title="No subscriptions" />
            ) : (
              data.subscriptions.map((subscription, index) => (
                <SubscriptionRow
                  key={subscription.id}
                  orgId={org.id}
                  subscription={{ ...subscription, customerName: data.customer.name }}
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
                  purchase={{ ...purchase, customerName: data.customer.name }}
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
                  invoice={{ ...invoice, customerName: data.customer.name }}
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
