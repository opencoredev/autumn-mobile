import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ScrollView, View } from "react-native";
import { formatMoney, intervalSuffix, type Org } from "@autumn/shared";
import { Section } from "@/src/components/Section";
import { Skeleton } from "@/src/components/Skeleton";
import { EmptyState, ErrorState } from "@/src/components/States";
import { Text } from "@/src/components/Text";
import { DetailRow } from "@/src/components/DetailRow";
import { api } from "@/src/lib/api";
import { useOrgCurrency } from "@/src/lib/currency";
import { longDate } from "@/src/lib/format";
import { intervalWord, trialLabel } from "@/src/lib/plans";
import { queryKeys } from "@/src/lib/query";
import { useRouteOrg, useRouteParam } from "@/src/lib/route-org";
import { space, usePalette } from "@/src/theme";

export default function PlanScreen() {
  const org = useRouteOrg();
  if (!org)
    return (
      <EmptyState title="Organization not found" body="It may have been removed from this app." />
    );
  return <PlanDetail org={org} />;
}

function PlanDetail({ org }: { readonly org: Org }) {
  const palette = usePalette();
  const planId = useRouteParam("planId");
  const currency = useOrgCurrency(org.id);
  const query = useQuery({ queryKey: queryKeys.plans(org.id), queryFn: () => api.plans(org.id) });
  const plan = query.data?.plans.find((candidate) => candidate.id === planId);

  if (query.isPending) {
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Skeleton width={180} height={28} />
        <Skeleton width={120} height={16} />
      </View>
    );
  }
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!plan)
    return <EmptyState title="Plan not found" body="It may have been archived in Autumn." />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    >
      <Stack.Screen options={{ title: plan.name }} />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: 6 }}>
        <Text variant="label">
          {plan.addOn ? "Add-on" : "Plan"} · v{plan.version}
        </Text>
        <Text variant="display">
          {plan.price
            ? `${formatMoney({ amount: plan.price.amount, currency })}${intervalSuffix(plan.price.interval)}`
            : plan.isFree
              ? "Free"
              : "Usage-based"}
        </Text>
        {plan.description ? (
          <Text variant="body" tone="muted">
            {plan.description}
          </Text>
        ) : null}
      </View>
      <Section title="Details">
        <DetailRow label="ID" value={plan.id} mono />
        <DetailRow label="Billing" value={intervalWord(plan)} />
        <DetailRow label="Trial" value={trialLabel(plan) ?? "None"} />
        {plan.freeTrial ? (
          <DetailRow
            label="Card for trial"
            value={plan.freeTrial.cardRequired ? "Required" : "Not required"}
          />
        ) : null}
        <DetailRow label="Group" value={plan.group ?? "None"} />
        <DetailRow label="Features" value={String(plan.itemCount)} mono />
        <DetailRow label="Auto-enabled" value={plan.autoEnable ? "Yes" : "No"} />
        <DetailRow label="Created" value={longDate(plan.createdAt)} isLast />
      </Section>
    </ScrollView>
  );
}
