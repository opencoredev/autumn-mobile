import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ScrollView, View } from "react-native";
import { formatMoney, type Org } from "@autumn/shared";
import { Button } from "@/src/components/Button";
import { DetailRow } from "@/src/components/DetailRow";
import { Row } from "@/src/components/Row";
import { Section } from "@/src/components/Section";
import { Skeleton } from "@/src/components/Skeleton";
import { EmptyState, ErrorState } from "@/src/components/States";
import { InvoiceStatusChip } from "@/src/components/StatusChip";
import { Text } from "@/src/components/Text";
import { api } from "@/src/lib/api";
import { longDate, shortDate } from "@/src/lib/format";
import { queryKeys } from "@/src/lib/query";
import { useRouteOrg, useRouteParam } from "@/src/lib/route-org";
import { space, usePalette } from "@/src/theme";

export default function OrderScreen() {
  const org = useRouteOrg();
  const invoiceId = useRouteParam("invoiceId");
  if (!org || !invoiceId) {
    return (
      <EmptyState
        title="Order not found"
        body="The organization may have been removed from this app."
      />
    );
  }
  return <OrderDetail org={org} invoiceId={invoiceId} />;
}

function OrderDetail({ org, invoiceId }: { readonly org: Org; readonly invoiceId: string }) {
  const palette = usePalette();
  const router = useRouter();
  const query = useQuery({
    queryKey: queryKeys.invoice(org.id, invoiceId),
    queryFn: () => api.invoice(org.id, invoiceId),
  });

  if (query.isPending) {
    return (
      <View style={{ padding: space.lg, gap: space.md }}>
        <Skeleton width={90} height={12} />
        <Skeleton width={180} height={40} />
        <Skeleton width={140} height={14} />
      </View>
    );
  }
  if (!query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const invoice = query.data.invoice;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
    >
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <InvoiceStatusChip invoice={invoice} />
          <Text variant="label" tone="faint">
            {longDate(invoice.createdAt)}
          </Text>
        </View>
        <Text variant="display">{formatMoney(invoice.total)}</Text>
        {invoice.refunded > 0 ? (
          <Text variant="caption" style={{ color: palette.amber }}>
            {formatMoney({ amount: invoice.refunded, currency: invoice.total.currency })} refunded
          </Text>
        ) : null}
      </View>

      {invoice.customerId ? (
        <Section title="Customer">
          <Row
            title={invoice.customerName ?? invoice.customerId}
            subtitle={invoice.customerName ? invoice.customerId : undefined}
            showChevron
            isLast
            onPress={() =>
              router.push(`/org/${org.id}/customer/${encodeURIComponent(invoice.customerId ?? "")}`)
            }
          />
        </Section>
      ) : null}

      <Section title="Line items">
        {invoice.lines.length === 0 ? (
          <EmptyState title="No line items recorded" />
        ) : (
          invoice.lines.map((line, index) => (
            <Row
              key={line.id}
              title={line.description}
              subtitle={
                line.periodStart && line.periodEnd
                  ? `${shortDate(line.periodStart)} – ${shortDate(line.periodEnd)}`
                  : (line.featureName ?? undefined)
              }
              trailing={formatMoney({ amount: line.amount, currency: invoice.total.currency })}
              {...(line.quantity !== null
                ? { trailingCaption: `× ${line.quantity.toLocaleString("en-US")}` }
                : {})}
              isLast={index === invoice.lines.length - 1}
            />
          ))
        )}
      </Section>

      <Section title="Details">
        <DetailRow label="Invoice ID" value={invoice.id} mono />
        <DetailRow label="Plans" value={invoice.planNames.join(", ") || "None"} />
        {invoice.netPaid ? (
          <DetailRow label="Net paid" value={formatMoney(invoice.netPaid)} mono />
        ) : null}
        <DetailRow label="Currency" value={invoice.total.currency.toUpperCase()} mono isLast />
      </Section>

      {invoice.hostedInvoiceUrl ? (
        <View style={{ padding: space.lg }}>
          <Button
            label="View invoice"
            variant="secondary"
            onPress={() => {
              if (invoice.hostedInvoiceUrl)
                void WebBrowser.openBrowserAsync(invoice.hostedInvoiceUrl);
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}
