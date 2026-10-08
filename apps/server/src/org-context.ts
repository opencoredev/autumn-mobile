import { z } from "zod";
import { PlanSchema, RevenueSummarySchema, type Plan } from "@autumn/shared";
import { createAutumnClient, type AutumnClient } from "./autumn/client";
import { planView } from "./autumn/mappers";
import { InvoiceRaw, SubscriptionRaw } from "./autumn/schemas";
import type { OrgRow } from "./db";
import { DEFAULT_AUTUMN_BASE, type Deps } from "./env";
import { openSecret } from "./secrets";

/** Cache lifetimes. KV's minimum TTL is 60 seconds. */
const TTL = { plans: 600, names: 300, revenue: 300, currency: 86_400 } as const;

const cacheKey = {
  plans: (orgId: string) => `plans:v1:${orgId}`,
  names: (orgId: string) => `names:v1:${orgId}`,
  revenue: (orgId: string) => `dashboard:v3:${orgId}`,
  currency: (orgId: string) => `currency:v1:${orgId}`,
};

type Scope = { readonly env: Env; readonly deps: Deps };

async function readCache<S extends z.ZodType>(
  kv: KVNamespace,
  key: string,
  schema: S,
): Promise<z.infer<S> | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Decrypts the org's key just for this request and returns a read-only client. */
export async function autumnFor(scope: Scope, org: OrgRow): Promise<AutumnClient> {
  const secretKey = await openSecret({
    masterKey: scope.env.KEY_ENCRYPTION_KEY,
    userId: org.user_id,
    orgId: org.id,
    purpose: "autumn-key",
    ciphertext: org.key_ciphertext,
    iv: org.key_iv,
  });
  return createAutumnClient({
    baseUrl: scope.env.AUTUMN_API_BASE || DEFAULT_AUTUMN_BASE,
    secretKey,
    fetch: scope.deps.fetch,
  });
}

export async function cachedPlans(
  scope: Scope,
  org: OrgRow,
  client: AutumnClient,
): Promise<Map<string, Plan>> {
  const cached = await readCache(scope.env.CACHE, cacheKey.plans(org.id), z.array(PlanSchema));
  const plans = cached ?? (await client.listPlans()).map(planView);
  if (!cached) {
    await scope.env.CACHE.put(cacheKey.plans(org.id), JSON.stringify(plans), {
      expirationTtl: TTL.plans,
    });
  }
  return new Map(plans.map((plan) => [plan.id, plan]));
}

/** Customer id → name for the newest customers, so list rows show names. */
export async function cachedNames(
  scope: Scope,
  org: OrgRow,
  client: AutumnClient,
): Promise<Map<string, string>> {
  const cached = await readCache(
    scope.env.CACHE,
    cacheKey.names(org.id),
    z.record(z.string(), z.string()),
  );
  if (cached) return new Map(Object.entries(cached));
  const page = await client.listCustomers({ limit: 500 });
  const names: Record<string, string> = {};
  for (const customer of page.items) {
    if (customer.id && customer.name) names[customer.id] = customer.name;
  }
  await scope.env.CACHE.put(cacheKey.names(org.id), JSON.stringify(names), {
    expirationTtl: TTL.names,
  });
  return new Map(Object.entries(names));
}

const DashboardCache = z.object({
  revenue: RevenueSummarySchema,
  recentInvoices: z.array(InvoiceRaw),
  subscriptionCounts: z.object({
    active: z.number(),
    trialing: z.number(),
    truncated: z.boolean(),
  }),
  recentSubscriptions: z.array(SubscriptionRaw),
});
export type DashboardCache = z.infer<typeof DashboardCache>;

/**
 * Revenue, newest invoices, subscription counts and newest subscriptions,
 * computed from full passes over the invoice and subscription lists and cached
 * briefly. Webhook events clear it.
 */
export async function cachedDashboard(
  scope: Scope,
  org: OrgRow,
  compute: () => Promise<DashboardCache>,
): Promise<DashboardCache> {
  const cached = await readCache(scope.env.CACHE, cacheKey.revenue(org.id), DashboardCache);
  if (cached) return cached;
  const fresh = await compute();
  await scope.env.CACHE.put(cacheKey.revenue(org.id), JSON.stringify(fresh), {
    expirationTtl: TTL.revenue,
  });
  const main = fresh.revenue.series[0];
  if (main) {
    await scope.env.CACHE.put(cacheKey.currency(org.id), main.currency, {
      expirationTtl: TTL.currency,
    });
  }
  return fresh;
}

export async function invalidateDashboard(env: Env, orgId: string): Promise<void> {
  await env.CACHE.delete(cacheKey.revenue(orgId));
}

/**
 * Plans don't carry a currency in Autumn's API; base prices are in the org's
 * default currency. We use the main revenue currency we last saw, else USD.
 */
export async function orgCurrency(scope: Scope, org: OrgRow): Promise<string> {
  return (await scope.env.CACHE.get(cacheKey.currency(org.id))) ?? "USD";
}

export async function clearOrgCache(env: Env, orgId: string): Promise<void> {
  await Promise.all(Object.values(cacheKey).map((key) => env.CACHE.delete(key(orgId))));
}
