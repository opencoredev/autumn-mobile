import { useLocalSearchParams } from "expo-router";
import type { Org } from "@autumn/shared";
import { useOrgs } from "./orgs";

/**
 * Resolves the `orgId` route param against the user's orgs. Deep links can
 * point at an org that was removed, so this returns null instead of throwing.
 */
export function useRouteOrg(): Org | null {
  const { orgId } = useLocalSearchParams<{ orgId?: string }>();
  const { orgs } = useOrgs();
  return orgs.find((org) => org.id === orgId) ?? null;
}

export function useRouteParam(name: string): string | null {
  const params = useLocalSearchParams();
  const value = params[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}
