import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { OrgIdSchema, type Org, type OrgId } from "@autumn/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import { queryKeys } from "./query";

const ACTIVE_ORG_KEY = "autumn-dashboard.active-org";

type OrgsContextValue = {
  readonly orgs: Org[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly activeOrg: Org | null;
  readonly setActiveOrgId: (orgId: OrgId) => void;
  readonly refetch: () => Promise<unknown>;
};

const OrgsContext = createContext<OrgsContextValue | null>(null);

export function OrgsProvider({ children }: { readonly children: ReactNode }) {
  const { state } = useAuth();
  const [storedId, setStoredId] = useState<OrgId | null>(null);

  const query = useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => api.listOrgs(),
    enabled: state.kind === "signedIn",
    select: (response) => response.orgs,
  });

  useEffect(() => {
    void AsyncStorage.getItem(ACTIVE_ORG_KEY).then((raw) => {
      const parsed = OrgIdSchema.safeParse(raw);
      if (parsed.success) setStoredId(parsed.data);
    });
  }, []);

  const setActiveOrgId = useCallback((orgId: OrgId) => {
    setStoredId(orgId);
    void AsyncStorage.setItem(ACTIVE_ORG_KEY, orgId);
  }, []);

  const orgs = useMemo(() => query.data ?? [], [query.data]);
  const activeOrg = orgs.find((org) => org.id === storedId) ?? orgs[0] ?? null;

  const value = useMemo<OrgsContextValue>(
    () => ({
      orgs,
      isLoading: query.isPending && state.kind === "signedIn",
      error: query.error,
      activeOrg,
      setActiveOrgId,
      refetch: query.refetch,
    }),
    [orgs, query.isPending, query.error, query.refetch, state.kind, activeOrg, setActiveOrgId],
  );
  return <OrgsContext.Provider value={value}>{children}</OrgsContext.Provider>;
}

export function useOrgs(): OrgsContextValue {
  const value = useContext(OrgsContext);
  if (!value) throw new Error("useOrgs must be used inside OrgsProvider");
  return value;
}

/** The active org. Screens under the app layout only render once one exists. */
export function useActiveOrg(): Org {
  const { activeOrg } = useOrgs();
  if (!activeOrg) throw new Error("useActiveOrg called before an org exists");
  return activeOrg;
}
