import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PagedList } from "@/src/components/PagedList";
import { SubscriptionRow } from "@/src/components/rows";
import { api } from "@/src/lib/api";
import { useActiveOrg } from "@/src/lib/orgs";
import { FIRST_PAGE, queryKeys } from "@/src/lib/query";

export default function SubscriptionsScreen() {
  const org = useActiveOrg();
  const query = useInfiniteQuery({
    queryKey: queryKeys.subscriptions(org.id),
    queryFn: ({ pageParam }) => api.subscriptions(org.id, pageParam),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return (
    <PagedList
      items={items}
      keyOf={(item) => item.id}
      renderItem={(item) => <SubscriptionRow orgId={org.id} subscription={item} />}
      isPending={query.isPending}
      error={query.error}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={() => void query.fetchNextPage()}
      refetch={query.refetch}
      empty={{ title: "No subscriptions", body: "Active and scheduled subscriptions appear here." }}
    />
  );
}
