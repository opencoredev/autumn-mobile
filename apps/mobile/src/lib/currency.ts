import { useQueryClient } from "@tanstack/react-query";
import type { OrgId, OverviewResponse } from "@autumn/shared";
import { queryKeys } from "./query";

/**
 * Plans don't carry a currency in Autumn's API; prices are in the org's
 * default currency. Use the main revenue currency we've seen, else USD.
 */
export function useOrgCurrency(orgId: OrgId): string {
  const client = useQueryClient();
  const overview = client.getQueryData<OverviewResponse>(queryKeys.overview(orgId));
  return overview?.revenue.series[0]?.currency ?? "USD";
}
