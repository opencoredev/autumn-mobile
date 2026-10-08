import { Hono, type Context } from "hono";
import type {
  CustomerDetail,
  CustomerSummary,
  Invoice,
  InvoiceResponse,
  OverviewResponse,
  Page,
  PlanListResponse,
  Purchase,
  Subscription,
} from "@autumn/shared";
import { firstNonEmptyPage, type AutumnClient } from "../autumn/client";
import {
  customerSummary,
  embeddedPurchases,
  embeddedSubscriptions,
  invoiceView,
  lifetimeValue,
  purchaseView,
  subscriptionView,
} from "../autumn/mappers";
import { InvoiceRaw, parseRows, type SubscriptionRaw } from "../autumn/schemas";
import type { AppEnv } from "../env";
import { HttpError, param } from "../http";
import { autumnFor, cachedDashboard, cachedNames, cachedPlans, orgCurrency } from "../org-context";
import { collectInvoices, newestOrders, summarizeRevenue } from "../revenue";
import { requireOrg } from "./orgs";

export const dashboardRoutes = new Hono<AppEnv>();

const REVENUE_WINDOW_DAYS = 30;
const REVENUE_MAX_PAGES = 20;
// Counts stop after 10 pages of 200 (2,000 subscriptions); see the README.
const SUBSCRIPTION_COUNT_MAX_PAGES = 10;
const RECENT_LIMIT = 10;

const newestFirst = <T extends { createdAt: number }>(items: T[]) =>
  [...items].sort((a, b) => b.createdAt - a.createdAt);

async function orgScope(c: Context<AppEnv>) {
  const org = await requireOrg(c);
  const scope = { env: c.env, deps: c.var.deps };
  const client = await autumnFor(scope, org);
  return { org, scope, client };
}

async function allSubscriptions(client: AutumnClient): Promise<SubscriptionRaw[]> {
  const rows: SubscriptionRaw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < SUBSCRIPTION_COUNT_MAX_PAGES; page += 1) {
    const result = await client.listSubscriptions({ cursor, limit: 200 });
    rows.push(...result.items);
    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return rows;
}

dashboardRoutes.get("/:orgId/overview", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const now = c.var.deps.now();
  const [plans, names] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
  ]);

  // One full pass over every invoice (Autumn's list order is undocumented)
  // feeds both the revenue chart and the recent orders.
  const dashboard = await cachedDashboard(scope, org, async () => {
    const { invoices, truncated } = await collectInvoices({
      fetchPage: (cursor) => client.listInvoices({ cursor, limit: 1000 }),
      maxPages: REVENUE_MAX_PAGES,
    });
    return {
      revenue: summarizeRevenue({ invoices, now, windowDays: REVENUE_WINDOW_DAYS, truncated }),
      recentInvoices: newestOrders(invoices, RECENT_LIMIT),
    };
  });
  const revenue = dashboard.revenue;
  const currency = revenue.series[0]?.currency ?? (await orgCurrency(scope, org));

  const subscriptionRows = await allSubscriptions(client);
  const subscriptions = subscriptionRows.flatMap((raw) =>
    raw.customer_id
      ? [subscriptionView({ raw, customerId: raw.customer_id, plans, names, currency, now })]
      : [],
  );
  const base = subscriptions.filter((sub) => !sub.addOn);

  const body: OverviewResponse = {
    revenue,
    activeSubscriptions: base.filter((sub) =>
      ["active", "canceling", "past_due"].includes(sub.status),
    ).length,
    trialingSubscriptions: base.filter((sub) => sub.status === "trialing").length,
    recentSubscriptions: newestFirst(subscriptions).slice(0, RECENT_LIMIT),
    recentOrders: dashboard.recentInvoices.map((raw) => invoiceView({ raw, plans, names })),
  };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/subscriptions", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const now = c.var.deps.now();
  const [plans, names, currency] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
    orgCurrency(scope, org),
  ]);
  const page = await firstNonEmptyPage({
    cursor: c.req.query("cursor") ?? null,
    fetchPage: (cursor) => client.listSubscriptions({ cursor, limit: 50 }),
  });
  const body: Page<Subscription> = {
    items: newestFirst(
      page.items.flatMap((raw) =>
        raw.customer_id
          ? [subscriptionView({ raw, customerId: raw.customer_id, plans, names, currency, now })]
          : [],
      ),
    ),
    nextCursor: page.nextCursor,
  };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/purchases", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const [plans, names, currency] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
    orgCurrency(scope, org),
  ]);
  const page = await firstNonEmptyPage({
    cursor: c.req.query("cursor") ?? null,
    fetchPage: (cursor) => client.listPurchases({ cursor, limit: 50 }),
  });
  const body: Page<Purchase> = {
    items: newestFirst(
      page.items.flatMap((raw) =>
        raw.customer_id
          ? [purchaseView({ raw, customerId: raw.customer_id, plans, names, currency })]
          : [],
      ),
    ),
    nextCursor: page.nextCursor,
  };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/invoices", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const [plans, names] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
  ]);
  const page = await client.listInvoices({ cursor: c.req.query("cursor") ?? null, limit: 50 });
  const body: Page<Invoice> = {
    items: newestFirst(page.items.map((raw) => invoiceView({ raw, plans, names }))),
    nextCursor: page.nextCursor,
  };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/invoices/:invoiceId", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const invoiceId = param(c, "invoiceId");
  const page = await client.listInvoices({ invoiceId, limit: 1 });
  const raw = page.items.find((invoice) => invoice.id === invoiceId);
  if (!raw) throw new HttpError("not_found", "Invoice not found.");
  const [plans, names] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
  ]);
  const body: InvoiceResponse = { invoice: invoiceView({ raw, plans, names }) };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/plans", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const plans = await cachedPlans(scope, org, client);
  const body: PlanListResponse = { plans: [...plans.values()].filter((plan) => !plan.archived) };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/customers", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const now = c.var.deps.now();
  const plans = await cachedPlans(scope, org, client);
  const search = c.req.query("search")?.trim() || null;
  const page = await client.listCustomers({
    cursor: c.req.query("cursor") ?? null,
    limit: 50,
    search,
  });
  const items: CustomerSummary[] = page.items.flatMap((raw) => {
    const id = raw.id;
    return id ? [customerSummary({ raw: { ...raw, id }, plans, now })] : [];
  });
  const body: Page<CustomerSummary> = { items, nextCursor: page.nextCursor };
  return c.json(body);
});

dashboardRoutes.get("/:orgId/customers/:customerId", async (c) => {
  const { org, scope, client } = await orgScope(c);
  const now = c.var.deps.now();
  const raw = await client.getCustomer(param(c, "customerId"));
  const customerId = raw.id;
  if (!customerId) throw new HttpError("not_found", "Customer not found.");
  const [plans, currency] = await Promise.all([
    cachedPlans(scope, org, client),
    orgCurrency(scope, org),
  ]);
  const names = new Map(raw.name ? [[customerId, raw.name]] : []);
  const invoices = parseRows(InvoiceRaw, raw.invoices ?? []);
  const subscriptions = embeddedSubscriptions(raw);

  const body: CustomerDetail = {
    customer: {
      ...customerSummary({ raw: { ...raw, id: customerId }, plans, now }),
      stripeId: raw.stripe_id,
    },
    subscriptions: newestFirst(
      subscriptions.map((sub) =>
        subscriptionView({ raw: sub, customerId, plans, names, currency, now }),
      ),
    ).sort((a, b) => Number(a.status === "expired") - Number(b.status === "expired")),
    purchases: newestFirst(
      embeddedPurchases(raw).map((purchase) =>
        purchaseView({ raw: purchase, customerId, plans, names, currency }),
      ),
    ),
    invoices: newestFirst(invoices.map((invoice) => invoiceView({ raw: invoice, plans, names }))),
    lifetimeValue: lifetimeValue(invoices),
  };
  return c.json(body);
});
