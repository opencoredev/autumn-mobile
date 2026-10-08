import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { RefreshControl, View } from "react-native";
import { usePullToRefresh } from "../lib/use-refresh";
import { space, usePalette } from "../theme";
import { SkeletonRows } from "./Skeleton";
import { EmptyState, ErrorState } from "./States";

/** Infinite, pull-to-refresh list backed by a react-query infinite query. */
export function PagedList<T>({
  items,
  keyOf,
  renderItem,
  isPending,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refetch,
  empty,
  header,
}: {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly renderItem: (item: T, index: number) => ReactElement;
  readonly isPending: boolean;
  readonly error: unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => unknown;
  readonly refetch: () => Promise<unknown>;
  readonly empty: { readonly title: string; readonly body?: string };
  readonly header?: ReactElement;
}) {
  const palette = usePalette();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  if (isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        {header}
        <SkeletonRows count={8} />
      </View>
    );
  }
  if (error && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        {header}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={keyOf}
      renderItem={({ item, index }) => renderItem(item, index)}
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState title={empty.title} {...(empty.body ? { body: empty.body } : {})} />
      }
      ListFooterComponent={isFetchingNextPage ? <SkeletonRows count={2} /> : null}
      onEndReachedThreshold={0.6}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.textMuted}
        />
      }
    />
  );
}
