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
  readonly empty: {
    readonly title: string;
    readonly body?: string;
    readonly action?: { readonly label: string; readonly onPress: () => void };
  };
  readonly header?: ReactElement;
}) {
  const palette = usePalette();
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  if (isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        {header}
        {/* Same frame and insets as the loaded list, so nothing jumps. */}
        <View
          style={{
            marginHorizontal: space.md,
            marginTop: space.sm,
            borderWidth: 1,
            borderColor: palette.hairline,
            backgroundColor: palette.surface,
          }}
        >
          <SkeletonRows count={8} />
        </View>
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
      renderItem={({ item, index }) => (
        // Rows sit in one hairline-framed column, as on useautumn.com.
        <View
          style={{
            marginHorizontal: space.md,
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderTopWidth: index === 0 ? 1 : 0,
            borderBottomWidth: index === items.length - 1 ? 1 : 0,
            borderColor: palette.hairline,
            backgroundColor: palette.surface,
          }}
        >
          {renderItem(item, index)}
        </View>
      )}
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ paddingTop: space.sm, paddingBottom: space.xxl }}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          title={empty.title}
          {...(empty.body ? { body: empty.body } : {})}
          {...(empty.action ? { action: empty.action } : {})}
        />
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
