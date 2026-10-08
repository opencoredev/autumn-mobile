const expected = "am_sk_test_demo_key";
const now = Date.now();
const plans = [
  {
    id: "pro",
    name: "Pro",
    description: null,
    group: null,
    version: 1,
    add_on: false,
    auto_enable: true,
    archived: false,
    price: { amount: 29, interval: "month" },
    items: [],
    created_at: now,
  },
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
    created_at: now,
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
    price: { amount: 49, interval: "one_off" },
    items: [],
    created_at: now,
  },
];
const invoices = Array.from({ length: 40 }, (_, i) => ({
  id: `in_demo_${i}`,
  customer_id: "cus_demo_1",
  plan_ids: [i % 3 === 0 ? "lifetime" : "pro"],
  status: "paid",
  total: i % 5 === 0 ? 49 : 29,
  amount_paid: i % 7 === 0 ? null : i % 5 === 0 ? 49 : 29,
  refunded_amount: i % 11 === 0 ? 5 : 0,
  currency: i % 9 === 0 ? "eur" : "usd",
  created_at: now - i * 86400000,
  hosted_invoice_url: null,
  items: [],
}));
const server = Bun.serve({
  port: Number(process.env.PORT || 8789),
  async fetch(req) {
    if (req.method === "POST" && new URL(req.url).pathname === "/mock/push") {
      console.log(await req.text());
      return Response.json({ data: [] });
    }
    if (req.headers.get("authorization") !== `Bearer ${expected}`)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const path = new URL(req.url).pathname;
    if (path.endsWith("plans.list")) return Response.json({ list: plans });
    if (path.endsWith("invoices.list")) return Response.json({ list: invoices, next_cursor: null });
    if (path.endsWith("subscriptions.list"))
      return Response.json({
        list: [
          {
            id: "sub_demo",
            plan_id: "pro",
            auto_enable: true,
            add_on: false,
            past_due: false,
            canceled_at: null,
            expires_at: null,
            trial_ends_at: now + 86400000,
            started_at: now - 86400000,
            current_period_end: now + 2592000000,
            quantity: 1,
            status: "active",
            customer_id: "cus_demo_1",
            created_at: now - 86400000,
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    if (path.endsWith("purchases.list"))
      return Response.json({ list: [], has_more: false, next_cursor: null });
    if (path.endsWith("customers.get"))
      return Response.json({
        id: "cus_demo_1",
        name: "Acme Labs",
        created_at: now - 1000000,
        env: "live",
        stripe_id: null,
        metadata: {},
        subscriptions: [],
        purchases: [],
        invoices,
      });
    if (path.endsWith("customers.list"))
      return Response.json({
        list: [
          {
            id: "cus_demo_1",
            name: "Acme Labs",
            created_at: now - 1000000,
            env: "live",
            stripe_id: null,
            metadata: {},
            subscriptions: [],
            purchases: [],
          },
        ],
        next_cursor: null,
      });
    return Response.json({ list: [], next_cursor: null });
  },
});
console.log(`mock autumn listening on ${server.port}`);
