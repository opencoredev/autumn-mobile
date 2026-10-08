import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, type OrgId } from "@autumn/shared";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cached data renders instantly; it refetches in the background when stale.
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "autumn-dashboard-cache-v1",
  throttleTime: 1000,
});

/** Bump to drop every persisted cache entry after a contract change. */
export const CACHE_BUSTER = "1";

export const queryKeys = {
  me: ["me"] as const,
  orgs: ["orgs"] as const,
  settings: ["settings", "notifications"] as const,
  org: (orgId: OrgId) => ["org", orgId] as const,
  overview: (orgId: OrgId) => ["org", orgId, "overview"] as const,
  subscriptions: (orgId: OrgId) => ["org", orgId, "subscriptions"] as const,
  purchases: (orgId: OrgId) => ["org", orgId, "purchases"] as const,
  invoices: (orgId: OrgId) => ["org", orgId, "invoices"] as const,
  invoice: (orgId: OrgId, invoiceId: string) => ["org", orgId, "invoice", invoiceId] as const,
  plans: (orgId: OrgId) => ["org", orgId, "plans"] as const,
  customers: (orgId: OrgId, search: string) => ["org", orgId, "customers", search] as const,
  customer: (orgId: OrgId, customerId: string) => ["org", orgId, "customer", customerId] as const,
};

/** Cursor for the first page of any paginated list. */
export const FIRST_PAGE: string | null = null;
