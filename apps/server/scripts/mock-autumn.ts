const expected = "am_sk_test_demo_key";
const now = Date.now();
const day = 86_400_000;
const names = [
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
const plans = [
  {
    id: "free",
    name: "Free",
    description: null,
    group: null,
    version: 1,
    add_on: false,
    auto_enable: true,
    archived: false,
    price: null,
    items: [],
    created_at: now - 90 * day,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pro workspace",
    group: null,
    version: 1,
    add_on: false,
    auto_enable: true,
    archived: false,
    price: { amount: 29, interval: "month" },
    items: [],
    free_trial: { duration_length: 14, duration_type: "day", card_required: false },
    created_at: now - 90 * day,
  },
  {
    id: "team",
    name: "Team",
    description: "Team workspace",
    group: null,
    version: 1,
    add_on: false,
    auto_enable: false,
    archived: false,
    price: { amount: 99, interval: "month" },
    items: [],
    created_at: now - 90 * day,
  },
  {
    id: "annual",
    name: "Annual",
    description: null,
    group: null,
    version: 1,
    add_on: false,
    auto_enable: false,
    archived: false,
    price: { amount: 290, interval: "year" },
    items: [],
    created_at: now - 90 * day,
  },
  {
    id: "lifetime",
    name: "Lifetime",
    description: null,
    group: null,
    version: 1,
    add_on: false,
    auto_enable: false,
    archived: false,
    price: { amount: 149, interval: "one_off" },
    items: [],
    created_at: now - 90 * day,
  },
  {
    id: "extra_seats",
    name: "Extra seats",
    description: null,
    group: null,
    version: 1,
    add_on: true,
    auto_enable: false,
    archived: false,
    price: { amount: 10, interval: "month" },
    items: [],
    created_at: now - 90 * day,
  },
];
const subscriptions = names.map((_, i) => ({
  id: `sub_demo_${i + 1}`,
  plan_id: i % 5 === 0 ? "team" : "pro",
  auto_enable: true,
  add_on: false,
  past_due: i === 3,
  canceled_at: i === 2 ? now - day : null,
  expires_at: i === 4 ? now - day : null,
  trial_ends_at: i === 1 ? now + 5 * day : null,
  started_at: now - (i + 2) * day,
  current_period_end: now + 20 * day,
  quantity: (i % 3) + 1,
  status: i === 4 ? "expired" : i === 3 ? "past_due" : "active",
  customer_id: `cus_demo_${i + 1}`,
  created_at: now - (i + 2) * day,
}));
const purchases = [1, 2, 4, 7, 10].map((n, i) => ({
  id: `pur_demo_${i + 1}`,
  plan_id: "lifetime",
  expires_at: null,
  started_at: now - (i + 4) * day,
  quantity: 1,
  status: "active",
  customer_id: `cus_demo_${n}`,
  created_at: now - (i + 4) * day,
}));
const invoices = Array.from({ length: 64 }, (_, i) => ({
  id: `in_demo_${i}`,
  customer_id: `cus_demo_${(i % 12) + 1}`,
  plan_ids: [i % 11 === 0 ? "lifetime" : i % 5 === 0 ? "team" : "pro"],
  status: i % 17 === 0 ? "void" : i % 13 === 0 ? "open" : "paid",
  total: i % 11 === 0 ? 149 : i % 5 === 0 ? 99 : 29,
  amount_paid: i % 7 === 0 ? null : i % 11 === 0 ? 149 : i % 5 === 0 ? 99 : 29,
  refunded_amount: i % 19 === 0 ? 10 : 0,
  currency: i % 9 === 0 ? "eur" : "usd",
  created_at: now - i * (day * 0.7) - (i % 4) * 3600000,
  hosted_invoice_url: null,
  items: [],
}));
const customers = names.map((name, i) => ({
  id: `cus_demo_${i + 1}`,
  name,
  created_at: now - (i + 1) * 3 * day,
  env: i % 4 === 0 ? "sandbox" : "live",
  stripe_id: null,
  metadata: {},
  subscriptions: subscriptions
    .filter((s) => s.customer_id === `cus_demo_${i + 1}`)
    .map(({ customer_id: _customerId, ...s }) => s),
  purchases: purchases
    .filter((p) => p.customer_id === `cus_demo_${i + 1}`)
    .map(({ customer_id: _customerId, ...p }) => p),
}));
const pushes: unknown[] = [];
const page = (values: unknown[], _req: Request, body: Record<string, unknown> = {}) => {
  const limit = Math.min(Number(body.limit || 50), 100);
  const cursor = Number(body.start_cursor || 0);
  const chunk = values.slice(cursor, cursor + limit);
  const next = cursor + chunk.length < values.length ? String(cursor + chunk.length) : null;
  return Response.json({ list: chunk, has_more: next !== null, next_cursor: next });
};
const server = Bun.serve({
  port: Number(process.env.PORT || 8789),
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "POST" && path === "/mock/push") {
      const body = await req.json().catch(() => null);
      if (Array.isArray(body)) pushes.push(...body);
      const data = Array.isArray(body)
        ? body.map((message) => ({ status: "ok", id: `ticket_${pushes.length}`, message }))
        : [];
      return Response.json({ data });
    }
    if (req.method === "GET" && path === "/mock/pushes") return Response.json({ pushes });
    if (req.headers.get("authorization") !== `Bearer ${expected}`)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (path.endsWith("plans.list")) return Response.json({ list: plans, next_cursor: null });
    if (path.endsWith("invoices.list")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      let values = invoices;
      if (typeof body.invoice_id === "string")
        values = values.filter((item) => item.id === body.invoice_id);
      if (typeof body.customer_id === "string")
        values = values.filter((item) => item.customer_id === body.customer_id);
      if (typeof body.status === "string")
        values = values.filter((item) => item.status === body.status);
      return page(values, req, body);
    }
    if (path.endsWith("subscriptions.list"))
      return page(subscriptions, req, await req.json().catch(() => ({})));
    if (path.endsWith("purchases.list"))
      return page(purchases, req, await req.json().catch(() => ({})));
    if (path.endsWith("customers.get")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      const customer = customers.find((item) => item.id === body.customer_id);
      if (!customer) return Response.json({ error: "not_found" }, { status: 404 });
      return Response.json({
        ...customer,
        invoices:
          Array.isArray(body.expand) && body.expand.includes("invoices")
            ? invoices.filter((item) => item.customer_id === customer.id)
            : undefined,
      });
    }
    if (path.endsWith("customers.list")) {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      let values = [...customers];
      const search = typeof body.search === "string" ? body.search.toLowerCase() : "";
      if (search)
        values = values.filter(
          (item) =>
            item.name.toLowerCase().includes(search) || item.id.toLowerCase().includes(search),
        );
      values.sort((a, b) =>
        body.sort_order === "asc" ? a.created_at - b.created_at : b.created_at - a.created_at,
      );
      return page(values, req, body);
    }
    return Response.json({ list: [], next_cursor: null });
  },
});
console.log(`mock autumn listening on ${server.port}`);
