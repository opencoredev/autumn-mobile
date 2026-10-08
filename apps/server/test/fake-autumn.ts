/**
 * In-process stand-in for Autumn's read API and Expo's push endpoint. Used by
 * the tests (as an injected fetch) and by scripts/mock-autumn.ts for local dev.
 * All names and ids are invented; there are no email fields at all.
 */

const DAY = 86_400_000;

export const FAKE_AUTUMN_BASE = "https://autumn.fake";
export const FAKE_EXPO_URL = "https://expo.fake/push";

type Json = Record<string, unknown>;

export type RecordedPush = {
  to: string;
  title: string;
  body: string;
  data: Json;
  [key: string]: unknown;
};

const COMPANIES = [
  "Acme Labs",
  "Northwind",
  "Globex",
  "Initech",
  "Umbrella Studio",
  "Hooli",
  "Stark Analytics",
  "Wayne Logistics",
  "Soylent Foods",
  "Tyrell Robotics",
  "Cyberdyne",
  "Vandelay Imports",
];

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordedPush(value: unknown): value is RecordedPush {
  return (
    isRecord(value) &&
    typeof value.to === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    isRecord(value.data)
  );
}

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

export function buildFixtures(now: number) {
  const random = seededRandom(42);
  const plans = [
    {
      id: "free",
      name: "Free",
      description: "For side projects",
      group: null,
      version: 1,
      add_on: false,
      auto_enable: true,
      archived: false,
      price: null,
      items: [{ price: null }],
      free_trial: null,
      created_at: now - 300 * DAY,
    },
    {
      id: "pro",
      name: "Pro",
      description: "For growing teams",
      group: "core",
      version: 3,
      add_on: false,
      auto_enable: false,
      archived: false,
      price: { amount: 29, interval: "month" },
      items: [{ price: null }, { price: { amount: 0.01 } }],
      free_trial: { duration_length: 14, duration_type: "day", card_required: true },
      created_at: now - 280 * DAY,
    },
    {
      id: "team",
      name: "Team",
      description: "SSO and roles",
      group: "core",
      version: 2,
      add_on: false,
      auto_enable: false,
      archived: false,
      price: { amount: 99, interval: "month" },
      items: [{ price: null }],
      free_trial: null,
      created_at: now - 250 * DAY,
    },
    {
      id: "annual",
      name: "Pro Annual",
      description: null,
      group: "core",
      version: 1,
      add_on: false,
      auto_enable: false,
      archived: false,
      price: { amount: 290, interval: "year" },
      items: [],
      free_trial: null,
      created_at: now - 200 * DAY,
    },
    {
      id: "lifetime",
      name: "Lifetime",
      description: "Pay once",
      group: null,
      version: 1,
      add_on: false,
      auto_enable: false,
      archived: false,
      price: { amount: 149, interval: "one_off" },
      items: [],
      free_trial: null,
      created_at: now - 150 * DAY,
    },
    {
      id: "seats",
      name: "Extra seats",
      description: null,
      group: null,
      version: 1,
      add_on: true,
      auto_enable: false,
      archived: false,
      price: { amount: 10, interval: "month" },
      items: [],
      free_trial: null,
      created_at: now - 100 * DAY,
    },
  ];

  // 50 more quiet customers so the list has to paginate.
  const PREFIXES = [
    "Blue",
    "North",
    "Bright",
    "Quiet",
    "Silver",
    "Lunar",
    "Pine",
    "Atlas",
    "Nova",
    "Ember",
  ];
  const SUFFIXES = ["Works", "Labs", "Systems", "Partners", "Collective"];
  const extraNames = PREFIXES.flatMap((prefix) => SUFFIXES.map((suffix) => `${prefix} ${suffix}`));
  const customers = [...COMPANIES, ...extraNames].map((name, index) => ({
    id: `cus_demo_${index + 1}`,
    name,
    created_at: now - (index * 5 + 3) * DAY,
    env: "live",
    stripe_id: `cus_fake_${1000 + index}`,
    // Free-form metadata, including a contact address built at runtime. The
    // Worker must never pass metadata through.
    metadata: {
      source: index % 2 === 0 ? "organic" : "partner",
      contact: ["billing", "example.test"].join("@"),
    },
  }));

  const subscriptionPlan = [
    "pro",
    "team",
    "pro",
    "annual",
    "pro",
    "team",
    "free",
    "pro",
    "pro",
    "team",
    "seats",
    "pro",
  ];
  const subscriptions = customers.slice(0, COMPANIES.length).map((customer, index) => {
    const planId = subscriptionPlan[index] ?? "pro";
    const startedAt = now - (index * 3 + 0.5) * DAY - 40 * DAY * (index % 3 === 2 ? 1 : 0);
    return {
      id: `sub_demo_${index + 1}`,
      plan_id: planId,
      auto_enable: false,
      add_on: planId === "seats",
      past_due: index === 9,
      canceled_at: index === 5 ? now - DAY : null,
      expires_at: index === 5 ? now + 20 * DAY : null,
      trial_ends_at: index % 4 === 0 ? startedAt + 14 * DAY : null,
      started_at: startedAt,
      current_period_start: startedAt,
      current_period_end: startedAt + 30 * DAY,
      quantity: planId === "seats" ? 3 : 1,
      scope: "customer",
      status: "active",
      customer_id: customer.id,
      entity_id: null,
      created_at: startedAt,
    };
  });
  subscriptions.push({
    ...subscriptions[1]!,
    id: "sub_demo_expired",
    plan_id: "pro",
    status: "expired",
    expires_at: now - 50 * DAY,
    canceled_at: now - 60 * DAY,
    started_at: now - 120 * DAY,
    created_at: now - 120 * DAY,
  });

  // Every third extra customer pays for Pro, started long ago.
  customers.slice(COMPANIES.length).forEach((customer, index) => {
    if (index % 3 !== 0) return;
    const startedAt = now - (200 + index) * DAY;
    subscriptions.push({
      ...subscriptions[0]!,
      id: `sub_extra_${index}`,
      plan_id: "pro",
      add_on: false,
      past_due: false,
      canceled_at: null,
      expires_at: null,
      trial_ends_at: null,
      started_at: startedAt,
      current_period_start: startedAt,
      current_period_end: startedAt + 30 * DAY,
      quantity: 1,
      customer_id: customer.id,
      created_at: startedAt,
    });
  });

  const purchases = [2, 7, 10].map((customerIndex, index) => ({
    id: `pur_demo_${index + 1}`,
    plan_id: "lifetime",
    expires_at: null,
    started_at: now - (index * 6 + 1) * DAY,
    quantity: 1,
    scope: "customer",
    status: "active",
    customer_id: customers[customerIndex]!.id,
    entity_id: null,
    created_at: now - (index * 6 + 1) * DAY,
  }));

  const cyclePlans = ["pro", "team", "pro", "lifetime", "annual", "pro", "seats"];
  const invoices = Array.from({ length: 64 }, (_, index) => {
    const customer = customers[index % customers.length]!;
    const planId = cyclePlans[index % cyclePlans.length]!;
    const plan = plans.find((candidate) => candidate.id === planId)!;
    const quantity = planId === "seats" ? 3 : 1;
    const total = (plan.price?.amount ?? 0) * quantity;
    const status = index === 5 ? "open" : index === 11 ? "void" : "paid";
    const createdAt = now - (index * 0.7 + random() * 0.5) * DAY;
    return {
      id: `inv_demo_${index + 1}`,
      customer_id: customer.id,
      entity_id: null,
      plan_ids: [planId],
      stripe_id: `in_fake_${index + 1}`,
      processor_type: "stripe",
      status,
      total,
      amount_paid: status === "paid" ? (index === 20 ? null : total) : 0,
      refunded_amount: index === 8 ? total : index === 14 ? 10 : 0,
      currency: index % 13 === 0 ? "eur" : "usd",
      created_at: createdAt,
      hosted_invoice_url: "https://invoice.stripe.com/i/fake",
      items: [
        {
          id: `li_demo_${index + 1}`,
          description: `${plan.name}${quantity > 1 ? ` × ${quantity}` : ""}`,
          plan_id: planId,
          feature_id: null,
          feature_name: null,
          quantity: quantity > 1 ? quantity : null,
          amount: total,
          period_start: createdAt,
          period_end: plan.price?.interval === "one_off" ? null : createdAt + 30 * DAY,
          entities: [],
        },
      ],
    };
  });
  // Autumn doesn't document list order, so the fake returns oldest first.
  invoices.sort((a, b) => a.created_at - b.created_at);

  return { plans, customers, subscriptions, purchases, invoices };
}

export type Fixtures = ReturnType<typeof buildFixtures>;

function page<T>(
  rows: T[],
  body: Json,
): { list: T[]; next_cursor: string | null; has_more: boolean } {
  const limit = typeof body.limit === "number" ? body.limit : 50;
  const offset =
    typeof body.start_cursor === "string" && body.start_cursor ? Number(body.start_cursor) : 0;
  const slice = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? String(offset + limit) : null;
  return { list: slice, next_cursor: next, has_more: next !== null };
}

function statusMatches(row: { status: string; past_due?: boolean }, statuses: unknown): boolean {
  const wanted = Array.isArray(statuses) ? statuses : ["active", "scheduled"];
  return wanted.some((status) =>
    status === "past_due"
      ? row.status === "active" && row.past_due === true
      : status === row.status,
  );
}

export function createFakeAutumn(args: { now: number; validKey: string; fixtures?: Fixtures }) {
  const data = args.fixtures ?? buildFixtures(args.now);
  const pushes: RecordedPush[] = [];
  const autumnCalls: string[] = [];
  const unregisteredTokens = new Set<string>();
  const expo = { down: false };

  const withEmbedded = (customer: Fixtures["customers"][number]) => ({
    ...customer,
    subscriptions: data.subscriptions
      .filter((sub) => sub.customer_id === customer.id)
      .map(({ customer_id: _c, ...rest }) => rest),
    purchases: data.purchases
      .filter((purchase) => purchase.customer_id === customer.id)
      .map(({ customer_id: _c, ...rest }) => rest),
  });

  function autumn(path: string, body: Json): Response {
    switch (path) {
      case "/v1/plans.list":
        return Response.json({ list: data.plans });
      case "/v1/invoices.list": {
        let rows = data.invoices;
        if (typeof body.invoice_id === "string")
          rows = rows.filter((row) => row.id === body.invoice_id);
        if (typeof body.customer_id === "string")
          rows = rows.filter((row) => row.customer_id === body.customer_id);
        const statuses = body.status;
        if (Array.isArray(statuses)) rows = rows.filter((row) => statuses.includes(row.status));
        return Response.json(page(rows, body));
      }
      case "/v1/subscriptions.list": {
        const rows = data.subscriptions.filter(
          (row) =>
            statusMatches(row, body.statuses) &&
            (typeof body.customer_id !== "string" || row.customer_id === body.customer_id) &&
            (typeof body.plan_id !== "string" || row.plan_id === body.plan_id),
        );
        return Response.json(page(rows, body));
      }
      case "/v1/purchases.list": {
        const rows = data.purchases.filter((row) => statusMatches(row, body.statuses));
        return Response.json(page(rows, body));
      }
      case "/v1/customers.list": {
        const search = typeof body.search === "string" ? body.search.toLowerCase() : "";
        const rows = data.customers
          .filter(
            (row) => !search || row.name.toLowerCase().includes(search) || row.id.includes(search),
          )
          .sort((a, b) =>
            body.sort_order === "asc" ? a.created_at - b.created_at : b.created_at - a.created_at,
          )
          .map(withEmbedded);
        return Response.json(page(rows, body));
      }
      case "/v1/customers.get": {
        const customer = data.customers.find((row) => row.id === body.customer_id);
        if (!customer) return Response.json({ message: "Customer not found" }, { status: 404 });
        const expand = Array.isArray(body.expand) ? body.expand : [];
        const index = data.customers.indexOf(customer);
        return Response.json({
          ...withEmbedded(customer),
          balances: {
            messages: {
              object: "balance",
              feature_id: "messages",
              ...(expand.includes("balances.feature")
                ? { feature: { id: "messages", name: "Messages" } }
                : {}),
              granted: 1000,
              remaining: 1000 - ((index * 137) % 1000),
              usage: (index * 137) % 1000,
              unlimited: false,
              overage_allowed: false,
              max_purchase: null,
              next_reset_at: args.now + 12 * DAY,
            },
            api_calls: {
              object: "balance",
              feature_id: "api_calls",
              ...(expand.includes("balances.feature")
                ? { feature: { id: "api_calls", name: "API calls" } }
                : {}),
              granted: 50000,
              remaining: 50000 - ((index * 7919) % 50000),
              usage: (index * 7919) % 50000,
              unlimited: false,
              overage_allowed: true,
              max_purchase: null,
              next_reset_at: args.now + 12 * DAY,
            },
            seats: {
              object: "balance",
              feature_id: "seats",
              ...(expand.includes("balances.feature")
                ? { feature: { id: "seats", name: "Seats" } }
                : {}),
              granted: 0,
              remaining: 0,
              usage: 4,
              unlimited: true,
              overage_allowed: false,
              max_purchase: null,
              next_reset_at: null,
            },
          },
          ...(expand.includes("payment_method")
            ? {
                payment_method: {
                  type: "card",
                  card: {
                    brand: index % 2 ? "mastercard" : "visa",
                    last4: String(4242 + index).slice(-4),
                    exp_month: 8,
                    exp_year: 2028,
                  },
                },
              }
            : {}),
          ...(expand.includes("invoices")
            ? { invoices: data.invoices.filter((row) => row.customer_id === customer.id) }
            : {}),
        });
      }
      default:
        return Response.json({ message: "Not found" }, { status: 404 });
    }
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/push") || url.pathname === "/mock/push") {
      if (expo.down) return new Response("unavailable", { status: 503 });
      const batch: unknown = await request.json();
      const messages = Array.isArray(batch) ? batch.filter(isRecordedPush) : [];
      pushes.push(...messages);
      return Response.json({
        data: messages.map((message) =>
          unregisteredTokens.has(message.to)
            ? {
                status: "error",
                message: "not registered",
                details: { error: "DeviceNotRegistered" },
              }
            : { status: "ok", id: `ticket_${pushes.length}` },
        ),
      });
    }
    if (url.pathname === "/mock/pushes") return Response.json({ pushes });
    autumnCalls.push(url.pathname);
    if (request.headers.get("authorization") !== `Bearer ${args.validKey}`) {
      return Response.json({ message: "Invalid secret key" }, { status: 401 });
    }
    if (request.headers.get("x-api-version") !== "2.5.0") {
      return Response.json({ message: "Missing x-api-version" }, { status: 400 });
    }
    const body: unknown = await request.json().catch(() => ({}));
    return autumn(url.pathname, isRecord(body) ? body : {});
  }

  const fetchImpl: typeof fetch = (input, init) => handle(new Request(input, init));

  return { data, pushes, autumnCalls, unregisteredTokens, expo, handle, fetch: fetchImpl };
}
