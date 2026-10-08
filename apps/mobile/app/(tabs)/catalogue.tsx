import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { formatMoney, intervalSuffix, type Plan } from "@autumn/shared";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { SkeletonRows } from "@/src/components/Skeleton";
import { EmptyState, ErrorState } from "@/src/components/States";
import { api } from "@/src/lib/api";
import { useOrgCurrency } from "@/src/lib/currency";
import { useActiveOrg } from "@/src/lib/orgs";
import { intervalWord, trialLabel } from "@/src/lib/plans";
import { queryKeys } from "@/src/lib/query";
import { usePullToRefresh } from "@/src/lib/use-refresh";
import { space, usePalette } from "@/src/theme";

function PlanRows({
  plans,
  orgId,
  currency,
}: {
  readonly plans: Plan[];
  readonly orgId: string;
  readonly currency: string;
}) {
  const router = useRouter();
  return plans.map((plan, index) => {
    const meta = [intervalWord(plan), trialLabel(plan), plan.group].filter(Boolean).join(" · ");
    return (
      <Row
        key={plan.id}
        title={plan.name}
        subtitle={meta}
        trailing={
          plan.price
            ? `${formatMoney({ amount: plan.price.amount, currency })}${intervalSuffix(plan.price.interval)}`
            : plan.isFree
              ? "Free"
              : "Usage"
        }
        showChevron
        isLast={index === plans.length - 1}
        onPress={() => router.push(`/org/${orgId}/plan/${encodeURIComponent(plan.id)}`)}
      />
    );
  });
}

export default function CatalogueScreen() {
  const palette = usePalette();
  const org = useActiveOrg();
  const currency = useOrgCurrency(org.id);
  const query = useQuery({ queryKey: queryKeys.plans(org.id), queryFn: () => api.plans(org.id) });
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);

  const plans = query.data?.plans ?? [];
  const base = plans.filter((plan) => !plan.addOn);
  const addOns = plans.filter((plan) => plan.addOn);

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
      {query.isPending ? (
        <SkeletonRows count={6} />
      ) : query.isError && plans.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState title="No plans yet" body="Plans you create in Autumn will appear here." />
      ) : (
        <>
          <Section title={`Plans · ${base.length}`}>
            <PlanRows plans={base} orgId={org.id} currency={currency} />
          </Section>
          {addOns.length > 0 ? (
            <Section title={`Add-ons · ${addOns.length}`}>
              <PlanRows plans={addOns} orgId={org.id} currency={currency} />
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
