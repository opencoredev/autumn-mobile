import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { CustomerSummary } from "@autumn/shared";
import { PagedList } from "@/src/components/PagedList";
import { PlanStatusChip } from "@/src/components/StatusChip";
import { Text } from "@/src/components/Text";
import { PixelIcon } from "@/src/components/PixelIcon";
import { Avatar, Row } from "@/src/components/Row";
import { api } from "@/src/lib/api";
import { initials, relativeTime } from "@/src/lib/format";
import { useActiveOrg } from "@/src/lib/orgs";
import { FIRST_PAGE, queryKeys } from "@/src/lib/query";
import { useDebounced } from "@/src/lib/use-debounced";
import { fonts, space, usePalette } from "@/src/theme";

function SearchField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          height: 44,
          paddingHorizontal: space.md,
          backgroundColor: palette.surface,
          borderWidth: 1,
          borderColor: palette.hairline,
        }}
      >
        <PixelIcon name="search" size={14} color={palette.textFaint} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Search by name or ID"
          placeholderTextColor={palette.textFaint}
          selectionColor={palette.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search customers"
          style={{
            flex: 1,
            color: palette.text,
            fontFamily: fonts.regular,
            fontSize: 15,
            outlineWidth: 0,
          }}
        />
        {value ? (
          <Pressable
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={{
              width: 44,
              height: 44,
              marginRight: -space.md,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <PixelIcon name="close" size={12} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Up to two plan chips, as in the dashboard's customer list, then "+N". */
function CustomerPlans({ customer }: { readonly customer: CustomerSummary }) {
  const shown = customer.subscriptions.slice(0, 2);
  const extra = customer.subscriptions.length - shown.length + customer.purchaseCount;
  if (shown.length === 0) {
    return (
      <Text variant="caption">
        {customer.purchaseCount > 0
          ? `${customer.purchaseCount} one-time ${customer.purchaseCount === 1 ? "purchase" : "purchases"}`
          : "No active plan"}
      </Text>
    );
  }
  return (
    <View
      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 }}
    >
      {shown.map((subscription) => (
        <PlanStatusChip key={subscription.id} subscription={subscription} />
      ))}
      {extra > 0 ? <Text variant="caption">+{extra}</Text> : null}
    </View>
  );
}

export default function CustomersScreen() {
  const org = useActiveOrg();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search.trim(), 300);

  const query = useInfiniteQuery({
    queryKey: queryKeys.customers(org.id, debounced),
    queryFn: ({ pageParam }) =>
      api.customers(org.id, { search: debounced || null, cursor: pageParam }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: (previous) => previous,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  return (
    <View style={{ flex: 1 }}>
      <SearchField value={search} onChange={setSearch} />
      <PagedList
        items={items}
        keyOf={(customer) => customer.id}
        renderItem={(customer) => (
          <Row
            leading={<Avatar label={initials(customer.name ?? customer.id)} />}
            title={customer.name ?? customer.id}
            subtitle={<CustomerPlans customer={customer} />}
            trailingCaption={relativeTime(customer.createdAt)}
            showChevron
            onPress={() =>
              router.push(`/org/${org.id}/customer/${encodeURIComponent(customer.id)}`)
            }
          />
        )}
        isPending={query.isPending}
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        fetchNextPage={() => void query.fetchNextPage()}
        refetch={query.refetch}
        empty={
          debounced
            ? {
                title: `No customers match "${debounced}"`,
                body: "Search looks at names and customer IDs.",
                action: { label: "Clear search", onPress: () => setSearch("") },
              }
            : {
                title: "No customers yet",
                body: "Customers you create in Autumn will appear here.",
              }
        }
      />
    </View>
  );
}
