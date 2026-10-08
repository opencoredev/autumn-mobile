import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  PushDataSchema,
  type NotificationSettings,
  type Plan,
} from "@autumn/shared";
import type { InvoiceRaw } from "../src/autumn/schemas";
import { classifyEvent, WebhookEvent } from "../src/notifications";
import { buildMessages, sendExpoPush } from "../src/push";

const NOW = Date.UTC(2026, 9, 8, 15, 0, 0);
const DAY = 86_400_000;
const ORG = { id: "org_1", name: "Acme Cloud" };

function plan(overrides: Partial<Plan> & Pick<Plan, "id" | "name">): Plan {
  return {
    description: null,
    group: null,
    version: 1,
    addOn: false,
    autoEnable: false,
    archived: false,
    price: { amount: 29, interval: "month" },
    isFree: false,
    freeTrial: null,
    itemCount: 0,
    createdAt: 0,
    ...overrides,
  };
}

const PLANS = new Map<string, Plan>([
  ["pro", plan({ id: "pro", name: "Pro" })],
  ["free", plan({ id: "free", name: "Free", price: null, isFree: true })],
  [
    "lifetime",
    plan({ id: "lifetime", name: "Lifetime", price: { amount: 149, interval: "one_off" } }),
  ],
]);

const subscription = (overrides: Record<string, unknown> = {}) => ({
  plan_id: "pro",
  status: "active",
  past_due: false,
  started_at: NOW,
  canceled_at: null,
  expires_at: null,
  trial_ends_at: null,
  current_period_start: NOW,
  current_period_end: NOW + 30 * DAY,
  ...overrides,
});

function billing(planChanges: unknown[], tags: string[] = []) {
  return WebhookEvent.parse({
    type: "billing.updated",
    data: { object: "billing.updated", customer_id: "cus_7", plan_changes: planChanges, tags },
  });
}

function finalized(overrides: Partial<InvoiceRaw> = {}) {
  return WebhookEvent.parse({
    type: "invoice.finalized",
    data: {
      id: "inv_9",
      customer_id: "cus_7",
      entity_id: null,
      plan_ids: ["pro"],
      stripe_id: "in_9",
      processor_type: "stripe",
      status: "paid",
      total: 29,
      amount_paid: 29,
      refunded_amount: 0,
      currency: "usd",
      created_at: NOW,
      hosted_invoice_url: null,
      items: [],
      ...overrides,
    },
  });
}

function classify(args: {
  event: WebhookEvent;
  settings?: Partial<NotificationSettings>;
  startedAt?: ReadonlyMap<string, number>;
  customerName?: string | null;
}) {
  return classifyEvent({
    event: args.event,
    org: ORG,
    plans: PLANS,
    currency: "USD",
    settings: { ...DEFAULT_NOTIFICATION_SETTINGS, ...args.settings },
    now: NOW,
    customerName: args.customerName === undefined ? "Northwind" : args.customerName,
    ...(args.startedAt ? { subscriptionStartedAt: args.startedAt } : {}),
  });
}

const ALL_ON: Partial<NotificationSettings> = { renewals: true, cancellations: true };

describe("defaults", () => {
  it("match the product spec", () => {
    expect(DEFAULT_NOTIFICATION_SETTINGS).toEqual({
      pushEnabled: true,
      purchases: true,
      subscriptions: true,
      trials: true,
      renewals: false,
      cancellations: false,
      excludeFree: false,
    });
  });
});

describe("classifyEvent: billing.updated", () => {
  it("one-off activation is a purchase with price and plan in the title", () => {
    const [push] = classify({
      event: billing([
        {
          action: "activated",
          purchase: { plan_id: "lifetime", status: "active", expires_at: null },
          previous_attributes: null,
        },
      ]),
    });
    expect(push).toMatchObject({
      kind: "purchase",
      title: "New purchase · $149 Lifetime",
      body: "Northwind · Acme Cloud",
      path: "/org/org_1/customer/cus_7",
      amount: { amount: 149, currency: "USD" },
    });
    expect(PushDataSchema.safeParse(push).success).toBe(true);
  });

  it("activation without a trial is a new subscription", () => {
    const [push] = classify({
      event: billing([
        { action: "activated", subscription: subscription(), previous_attributes: null },
      ]),
    });
    expect(push?.kind).toBe("subscription");
    expect(push?.title).toBe("New subscription · $29 Pro");
  });

  it("activation with a future trial end is a trial", () => {
    const [push] = classify({
      event: billing([
        {
          action: "activated",
          subscription: subscription({ trial_ends_at: NOW + 14 * DAY }),
          previous_attributes: null,
        },
      ]),
    });
    expect(push?.kind).toBe("trial");
    expect(push?.title).toBe("New trial · Pro");
  });

  it("a trial that converts is announced as a paid subscription", () => {
    const [push] = classify({
      event: billing(
        [
          {
            action: "updated",
            subscription: subscription({ trial_ends_at: NOW - 1000 }),
            previous_attributes: { trial_ends_at: NOW + DAY },
          },
        ],
        ["trial_ended"],
      ),
    });
    expect(push?.kind).toBe("subscription");
  });

  it("canceled_at going from null to a time is a cancellation", () => {
    const [push] = classify({
      event: billing([
        {
          action: "updated",
          subscription: subscription({ canceled_at: NOW, expires_at: NOW + 20 * DAY }),
          previous_attributes: { canceled_at: null, expires_at: null },
        },
      ]),
      settings: ALL_ON,
    });
    expect(push?.kind).toBe("cancellation");
    expect(push?.title).toBe("Subscription canceled · Pro");
    expect(push?.amount).toBeNull();
  });

  it("other updates to an already-canceled plan are not cancellations", () => {
    expect(
      classify({
        event: billing([
          {
            action: "updated",
            subscription: subscription({ canceled_at: NOW - DAY, past_due: true }),
            previous_attributes: { past_due: false },
          },
        ]),
        settings: ALL_ON,
      }),
    ).toEqual([]);
  });

  it("an uncancel is not a cancellation", () => {
    expect(
      classify({
        event: billing([
          {
            action: "updated",
            subscription: subscription({ canceled_at: null }),
            previous_attributes: { canceled_at: NOW - DAY },
          },
        ]),
        settings: ALL_ON,
      }),
    ).toEqual([]);
  });

  it("expirations and scheduled plans don't push", () => {
    expect(
      classify({
        event: billing([
          {
            action: "expired",
            subscription: subscription({ status: "expired" }),
            previous_attributes: { status: "active" },
          },
          {
            action: "scheduled",
            subscription: subscription({ status: "scheduled" }),
            previous_attributes: null,
          },
        ]),
        settings: ALL_ON,
      }),
    ).toEqual([]);
  });

  it("unknown plans are skipped", () => {
    expect(
      classify({
        event: billing([
          {
            action: "activated",
            subscription: subscription({ plan_id: "ghost" }),
            previous_attributes: null,
          },
        ]),
      }),
    ).toEqual([]);
  });

  it("falls back to the customer id when there's no name", () => {
    const [push] = classify({
      event: billing([
        { action: "activated", subscription: subscription(), previous_attributes: null },
      ]),
      customerName: null,
    });
    expect(push?.body).toBe("cus_7 · Acme Cloud");
  });
});

describe("classifyEvent: invoice.finalized renewals", () => {
  const startedLongAgo = new Map([["pro", NOW - 31 * DAY]]);

  it("a later invoice for a recurring plan is a renewal at the invoiced amount", () => {
    const [push] = classify({
      event: finalized({ total: 31.5 }),
      settings: ALL_ON,
      startedAt: startedLongAgo,
    });
    expect(push).toMatchObject({
      kind: "renewal",
      title: "Renewal · $31.50 Pro",
      path: "/org/org_1/order/inv_9",
      amount: { amount: 31.5, currency: "USD" },
    });
  });

  it("the first invoice, within an hour of the start, is not a renewal", () => {
    expect(
      classify({
        event: finalized(),
        settings: ALL_ON,
        startedAt: new Map([["pro", NOW - 30 * 60_000]]),
      }),
    ).toEqual([]);
  });

  it("one-off plans, zero totals and unknown start times don't renew", () => {
    expect(
      classify({
        event: finalized({ plan_ids: ["lifetime"] }),
        settings: ALL_ON,
        startedAt: new Map([["lifetime", NOW - 90 * DAY]]),
      }),
    ).toEqual([]);
    expect(
      classify({ event: finalized({ total: 0 }), settings: ALL_ON, startedAt: startedLongAgo }),
    ).toEqual([]);
    expect(classify({ event: finalized(), settings: ALL_ON })).toEqual([]);
  });

  it("renewals are off by default", () => {
    expect(classify({ event: finalized(), startedAt: startedLongAgo })).toEqual([]);
  });
});

describe("settings filters", () => {
  const trial = billing([
    {
      action: "activated",
      subscription: subscription({ trial_ends_at: NOW + DAY }),
      previous_attributes: null,
    },
  ]);
  const paid = billing([
    { action: "activated", subscription: subscription(), previous_attributes: null },
  ]);
  const freeStart = billing([
    {
      action: "activated",
      subscription: subscription({ plan_id: "free" }),
      previous_attributes: null,
    },
  ]);
  const purchase = billing([
    {
      action: "activated",
      purchase: { plan_id: "lifetime", status: "active" },
      previous_attributes: null,
    },
  ]);

  it("the master switch silences everything", () => {
    for (const event of [trial, paid, purchase]) {
      expect(classify({ event, settings: { ...ALL_ON, pushEnabled: false } })).toEqual([]);
    }
  });

  it("each per-type toggle silences its own kind only", () => {
    expect(classify({ event: trial, settings: { trials: false } })).toEqual([]);
    expect(classify({ event: paid, settings: { trials: false } })).toHaveLength(1);
    expect(classify({ event: paid, settings: { subscriptions: false } })).toEqual([]);
    expect(classify({ event: purchase, settings: { purchases: false } })).toEqual([]);
  });

  it("exclude-free drops free subscription pushes but keeps paid ones", () => {
    expect(classify({ event: freeStart })).toHaveLength(1);
    expect(classify({ event: freeStart, settings: { excludeFree: true } })).toEqual([]);
    expect(classify({ event: paid, settings: { excludeFree: true } })).toHaveLength(1);
  });

  it("exclude-free drops free trials and cancellations too", () => {
    const freeTrial = billing([
      {
        action: "activated",
        subscription: subscription({ plan_id: "free", trial_ends_at: NOW + DAY }),
        previous_attributes: null,
      },
    ]);
    const freeCancel = billing([
      {
        action: "updated",
        subscription: subscription({ plan_id: "free", canceled_at: NOW }),
        previous_attributes: { canceled_at: null },
      },
    ]);
    expect(classify({ event: freeTrial, settings: { excludeFree: true } })).toEqual([]);
    expect(classify({ event: freeCancel, settings: { ...ALL_ON, excludeFree: true } })).toEqual([]);
    expect(classify({ event: freeCancel, settings: ALL_ON })).toHaveLength(1);
  });

  it("exclude-free never drops one-time purchases", () => {
    const freePurchasePlans = new Map(PLANS);
    freePurchasePlans.set(
      "lifetime",
      plan({ id: "lifetime", name: "Lifetime", price: null, isFree: true }),
    );
    const pushes = classifyEvent({
      event: purchase,
      org: ORG,
      plans: freePurchasePlans,
      currency: "USD",
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, excludeFree: true },
      now: NOW,
      customerName: null,
    });
    expect(pushes.map((push) => push.kind)).toEqual(["purchase"]);
  });
});

describe("Expo push messages", () => {
  const data = PushDataSchema.parse({
    kind: "subscription",
    orgId: "org_1",
    orgName: "Acme Cloud",
    path: "/org/org_1/customer/cus_7",
    title: "New subscription · $29 Pro",
    body: "Northwind · Acme Cloud",
    amount: { amount: 29, currency: "USD" },
  });

  it("carry the cha-ching sound and per-org grouping", () => {
    const [message] = buildMessages({ tokens: ["ExpoPushToken[a]"], notifications: [data] });
    expect(message).toMatchObject({
      to: "ExpoPushToken[a]",
      sound: "cha_ching.wav",
      channelId: "org-org_1",
      threadId: "org-org_1",
      priority: "high",
      data,
    });
  });

  it("send in batches of 100 and report unregistered devices", async () => {
    const tokens = Array.from({ length: 205 }, (_, index) => `ExpoPushToken[${index}]`);
    const batches: number[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      const body: unknown = JSON.parse(String(init?.body));
      const batch = Array.isArray(body) ? body : [];
      batches.push(batch.length);
      return Response.json({
        data: batch.map((message: { to?: string }) =>
          message.to === "ExpoPushToken[150]"
            ? { status: "error", details: { error: "DeviceNotRegistered" } }
            : { status: "ok", id: "t" },
        ),
      });
    };
    const result = await sendExpoPush({
      messages: buildMessages({ tokens, notifications: [data] }),
      url: "https://expo.fake/push",
      accessToken: undefined,
      fetch: fakeFetch,
    });
    expect(batches).toEqual([100, 100, 5]);
    expect(result.sent).toBe(204);
    expect(result.unregistered).toEqual(["ExpoPushToken[150]"]);
  });
});
