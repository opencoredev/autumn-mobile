import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { formatMoney, type OverviewResponse, type RevenueSeries } from "@autumn/shared";
import { RevenueChart } from "@/src/components/RevenueChart";
import { OrderRow, SubscriptionRow } from "@/src/components/rows";
import { Section } from "@/src/components/Section";
import { Skeleton, SkeletonRows } from "@/src/components/Skeleton";
import { EmptyState, ErrorState, errorMessage } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { api } from "@/src/lib/api";
import { dayLabel } from "@/src/lib/format";
import { useActiveOrg } from "@/src/lib/orgs";
import { queryKeys } from "@/src/lib/query";
import { usePullToRefresh } from "@/src/lib/use-refresh";
import { radius, space, usePalette } from "@/src/theme";

function RevenueHeader({
  series,
  activeIndex,
}: {
  readonly series: RevenueSeries;
  readonly activeIndex: number | null;
}) {
  const day = activeIndex === null ? null : series.days[activeIndex];
  const amount = day ? day.amount : series.total;
  return (
    <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
      <Text variant="label">{day ? dayLabel(day.date) : "Revenue · last 30 days"}</Text>
      <Text
        variant="display"
        accessibilityLiveRegion="polite"
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatMoney({ amount, currency: series.currency })}
      </Text>
      <Text variant="caption" tone="faint">
        {day
          ? "Net paid that day"
          : `${series.invoiceCount} paid ${series.invoiceCount === 1 ? "invoice" : "invoices"}, net of refunds`}
      </Text>
    </View>
  );
}

function CurrencyTabs({
  series,
  selected,
  onSelect,
}: {
  readonly series: RevenueSeries[];
  readonly selected: string;
  readonly onSelect: (currency: string) => void;
}) {
  const palette = usePalette();
  if (series.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", gap: space.xs, paddingHorizontal: space.lg }}>
      {series.map((item) => {
        const active = item.currency === selected;
        return (
          <Pressable
            key={item.currency}
            onPress={() => onSelect(item.currency)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={6}
            style={{
              paddingHorizontal: space.sm,
              paddingVertical: 4,
              borderRadius: radius.sm,
              backgroundColor: active ? palette.elevated : "transparent",
            }}
          >
            <Text variant="label" style={{ color: active ? palette.text : palette.textFaint }}>
              {item.currency}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  readonly label: string;
  readonly value: number;
  readonly tint: string;
}) {
  return (
    <View style={{ flex: 1, gap: 4, paddingHorizontal: space.lg, paddingVertical: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View style={{ width: 6, height: 6, backgroundColor: tint }} />
        <Text variant="label">{label}</Text>
      </View>
      <Text variant="mono" style={{ fontSize: 22, lineHeight: 28 }}>
        {value.toLocaleString("en-US")}
      </Text>
    </View>
  );
}

function OverviewSkeleton() {
  return (
    <View>
      <View style={{ paddingHorizontal: space.lg, gap: 10 }}>
        <Skeleton width={140} height={12} />
        <Skeleton width={200} height={40} />
        <Skeleton width={160} height={12} />
      </View>
      <Skeleton
        width="100%"
        height={168}
        style={{ marginTop: space.lg, borderRadius: 0, opacity: 0.6 }}
      />
      <View style={{ height: space.xl }} />
      <SkeletonRows count={4} />
    </View>
  );
}

function Overview({ data, orgId }: { readonly data: OverviewResponse; readonly orgId: string }) {
  const palette = usePalette();
  const router = useRouter();
  const [currency, setCurrency] = useState(data.revenue.series[0]?.currency ?? "USD");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const series =
    data.revenue.series.find((item) => item.currency === currency) ?? data.revenue.series[0];

  useEffect(() => {
    if (!data.revenue.series.some((item) => item.currency === currency)) {
      setCurrency(data.revenue.series[0]?.currency ?? "USD");
    }
  }, [data.revenue.series, currency]);

  const onActiveIndexChange = useCallback((index: number | null) => setActiveIndex(index), []);

  return (
    <View>
      {series ? (
        <View style={{ gap: space.md }}>
          <RevenueHeader series={series} activeIndex={activeIndex} />
          <CurrencyTabs
            series={data.revenue.series}
            selected={series.currency}
            onSelect={setCurrency}
          />
          <RevenueChart days={series.days} onActiveIndexChange={onActiveIndexChange} />
          {data.revenue.truncated ? (
            <Text variant="caption" tone="faint" style={{ paddingHorizontal: space.lg }}>
              Showing the most recent invoices only; the total may be low.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
          <Text variant="label">Revenue · last 30 days</Text>
          <Text variant="display">{formatMoney({ amount: 0, currency: "USD" })}</Text>
          <Text variant="caption" tone="faint">
            No paid invoices in the last 30 days.
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          marginTop: space.lg,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: palette.hairline,
        }}
      >
        <Stat label="Active" value={data.activeSubscriptions} tint={palette.positive} />
        <View style={{ width: 1, backgroundColor: palette.hairline }} />
        <Stat label="Trialing" value={data.trialingSubscriptions} tint={palette.trial} />
      </View>

      <Section
        title="Recent subscriptions"
        action={{ label: "See all", onPress: () => router.push("/subscriptions") }}
      >
        {data.recentSubscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions yet"
            body="New subscriptions and trials will show up here."
          />
        ) : (
          data.recentSubscriptions.map((subscription, index) => (
            <SubscriptionRow
              key={subscription.id}
              orgId={orgId}
              subscription={subscription}
              isLast={index === data.recentSubscriptions.length - 1}
            />
          ))
        )}
      </Section>

      <Section
        title="Recent orders"
        action={{ label: "See all", onPress: () => router.push("/orders") }}
      >
        {data.recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" body="Invoices from Autumn will show up here." />
        ) : (
          data.recentOrders.map((invoice, index) => (
            <OrderRow
              key={invoice.id}
              orgId={orgId}
              invoice={invoice}
              isLast={index === data.recentOrders.length - 1}
            />
          ))
        )}
      </Section>
    </View>
  );
}

export default function HomeScreen() {
  const palette = usePalette();
  const org = useActiveOrg();
  const query = useQuery({
    queryKey: queryKeys.overview(org.id),
    queryFn: () => api.overview(org.id),
  });
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingTop: space.md, paddingBottom: space.xxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.textMuted}
        />
      }
    >
      {query.data ? (
        <>
          {query.isError ? (
            <Text
              variant="caption"
              tone="danger"
              style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}
            >
              {errorMessage(query.error)} Showing saved data.
            </Text>
          ) : null}
          <Overview data={query.data} orgId={org.id} />
        </>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <OverviewSkeleton />
      )}
    </ScrollView>
  );
}
