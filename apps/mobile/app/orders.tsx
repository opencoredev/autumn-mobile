import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { PagedList } from "@/src/components/PagedList";
import { OrderRow, PurchaseRow } from "@/src/components/rows";
import { Segmented } from "@/src/components/Segmented";
import { api } from "@/src/lib/api";
import { useActiveOrg } from "@/src/lib/orgs";
import { FIRST_PAGE, queryKeys } from "@/src/lib/query";

type Tab = "invoices" | "purchases";

const TABS = [
  { value: "invoices", label: "Invoices" },
  { value: "purchases", label: "One-time" },
] as const satisfies readonly { value: Tab; label: string }[];

function InvoiceList() {
  const org = useActiveOrg();
  const query = useInfiniteQuery({
    queryKey: queryKeys.invoices(org.id),
    queryFn: ({ pageParam }) => api.invoices(org.id, pageParam),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return (
    <PagedList
      items={items}
      keyOf={(item) => item.id}
      renderItem={(item) => <OrderRow orgId={org.id} invoice={item} />}
      isPending={query.isPending}
      error={query.error}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={() => void query.fetchNextPage()}
      refetch={query.refetch}
      empty={{ title: "No invoices", body: "Invoices from Autumn appear here." }}
    />
  );
}

function PurchaseList() {
  const org = useActiveOrg();
  const query = useInfiniteQuery({
    queryKey: queryKeys.purchases(org.id),
    queryFn: ({ pageParam }) => api.purchases(org.id, pageParam),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return (
    <PagedList
      items={items}
      keyOf={(item) => item.id}
      renderItem={(item) => <PurchaseRow orgId={org.id} purchase={item} />}
      isPending={query.isPending}
      error={query.error}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={() => void query.fetchNextPage()}
      refetch={query.refetch}
      empty={{ title: "No one-time purchases", body: "Lifetime deals and top-ups appear here." }}
    />
  );
}

export default function OrdersScreen() {
  const [tab, setTab] = useState<Tab>("invoices");
  return (
    <View style={{ flex: 1 }}>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      {tab === "invoices" ? <InvoiceList /> : <PurchaseList />}
    </View>
  );
}
