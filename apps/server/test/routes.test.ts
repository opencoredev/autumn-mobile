import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  CustomerDetailSchema,
  CustomerPageSchema,
  ErrorBodySchema,
  InvoicePageSchema,
  InvoiceResponseSchema,
  MeResponseSchema,
  NotificationSettingsResponseSchema,
  OrgListResponseSchema,
  OrgResponseSchema,
  OverviewResponseSchema,
  PlanListResponseSchema,
  PurchasePageSchema,
  SessionResponseSchema,
  SubscriptionPageSchema,
  TestPushResponseSchema,
  type Org,
} from "@autumn/shared";
import {
  APPLE_AUDIENCE,
  createHarness,
  FAKE_KEY,
  GOOGLE_AUDIENCE,
  NOW,
  randomWebhookSecret,
  signSvix,
  type Harness,
} from "./harness";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});
afterEach(async () => {
  await h.dispose();
});

function parse<S extends z.ZodType>(
  schema: S,
  response: { status: number; json: unknown; text: string },
): z.infer<S> {
  const parsed = schema.safeParse(response.json);
  if (!parsed.success)
    throw new Error(`Unexpected ${response.status} body: ${response.text.slice(0, 300)}`);
  return parsed.data;
}

async function createOrg(token: string, name = "Acme Cloud"): Promise<Org> {
  const response = await h.request("/v1/orgs", {
    method: "POST",
    token,
    body: { name, secretKey: FAKE_KEY },
  });
  expect(response.status).toBe(200);
  return parse(OrgResponseSchema, response).org;
}

describe("auth", () => {
  it("rejects /v1 calls without a valid session", async () => {
    for (const token of [null, "not-a-real-token"]) {
      const response = await h.request("/v1/orgs", { token });
      expect(response.status).toBe(401);
      expect(parse(ErrorBodySchema, response).error.code).toBe("unauthorized");
    }
  });

  it("signs in with a Google ID token for any configured client ID", async () => {
    for (const audience of [GOOGLE_AUDIENCE, "other-client.apps.test"]) {
      const idToken = await h.identity.sign({
        issuer: "https://accounts.google.com",
        audience,
        subject: "g-123",
      });
      const session = parse(
        SessionResponseSchema,
        await h.request("/v1/auth/google", { method: "POST", body: { idToken } }),
      );
      expect(session.user.provider).toBe("google");
      const me = parse(MeResponseSchema, await h.request("/v1/me", { token: session.token }));
      expect(me.user.id).toBe(session.user.id);
    }
  });

  it("signs in with Apple and keeps the name Apple only sends once", async () => {
    const identityToken = await h.identity.sign({
      issuer: "https://appleid.apple.com",
      audience: APPLE_AUDIENCE,
      subject: "a-1",
    });
    const first = parse(
      SessionResponseSchema,
      await h.request("/v1/auth/apple", {
        method: "POST",
        body: { identityToken, displayName: "Robin Park" },
      }),
    );
    const second = parse(
      SessionResponseSchema,
      await h.request("/v1/auth/apple", {
        method: "POST",
        body: { identityToken, displayName: null },
      }),
    );
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.displayName).toBe("Robin Park");
  });

  it("rejects tokens with the wrong audience, issuer, or an expiry in the past", async () => {
    const bad = [
      await h.identity.sign({
        issuer: "https://accounts.google.com",
        audience: "someone-else",
        subject: "g",
      }),
      await h.identity.sign({
        issuer: "https://evil.example",
        audience: GOOGLE_AUDIENCE,
        subject: "g",
      }),
      await h.identity.sign({
        issuer: "https://accounts.google.com",
        audience: GOOGLE_AUDIENCE,
        subject: "g",
        expiresIn: "-1m",
      }),
      await h.identity.sign({
        issuer: "https://appleid.apple.com",
        audience: APPLE_AUDIENCE,
        subject: "g",
      }),
    ];
    for (const idToken of bad) {
      const response = await h.request("/v1/auth/google", { method: "POST", body: { idToken } });
      expect(response.status).toBe(401);
    }
    const wrongApple = await h.identity.sign({
      issuer: "https://appleid.apple.com",
      audience: GOOGLE_AUDIENCE,
      subject: "a",
    });
    expect(
      (
        await h.request("/v1/auth/apple", {
          method: "POST",
          body: { identityToken: wrongApple, displayName: null },
        })
      ).status,
    ).toBe(401);
  });

  it("logout revokes the session", async () => {
    const token = await h.devLogin();
    expect((await h.request("/v1/orgs", { token })).status).toBe(200);
    expect((await h.request("/v1/auth/logout", { method: "POST", token })).status).toBe(200);
    expect((await h.request("/v1/orgs", { token })).status).toBe(401);
  });

  it("dev login is a 404 unless ALLOW_DEV_LOGIN is true", async () => {
    await h.dispose();
    h = await createHarness({ allowDevLogin: false });
    expect((await h.request("/v1/auth/dev", { method: "POST" })).status).toBe(404);
  });
});

describe("orgs and secret keys", () => {
  it("validates the key with a read-only call and rejects bad keys", async () => {
    const token = await h.devLogin();
    const response = await h.request("/v1/orgs", {
      method: "POST",
      token,
      body: { name: "Bad", secretKey: "am_sk_live_wrong_key" },
    });
    expect(response.status).toBe(400);
    expect(parse(ErrorBodySchema, response).error.code).toBe("invalid_autumn_key");
    expect(h.fake.autumnCalls).toEqual(["/v1/plans.list"]);
    expect(parse(OrgListResponseSchema, await h.request("/v1/orgs", { token })).orgs).toEqual([]);
  });

  it("never returns or stores the key or webhook secret in plaintext", async () => {
    const token = await h.devLogin();
    const secret = randomWebhookSecret();
    const created = await h.request("/v1/orgs", {
      method: "POST",
      token,
      body: { name: "Acme Cloud", secretKey: FAKE_KEY },
    });
    const org = parse(OrgResponseSchema, created).org;
    const responses = [
      created,
      await h.request("/v1/orgs", { token }),
      await h.request(`/v1/orgs/${org.id}`, { method: "PATCH", token, body: { name: "Renamed" } }),
      await h.request(`/v1/orgs/${org.id}/key`, {
        method: "PUT",
        token,
        body: { secretKey: FAKE_KEY },
      }),
      await h.request(`/v1/orgs/${org.id}/webhook-secret`, {
        method: "PUT",
        token,
        body: { signingSecret: secret },
      }),
      await h.request(`/v1/orgs/${org.id}/overview`, { token }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.text).not.toContain(FAKE_KEY);
      expect(response.text).not.toContain(secret);
      expect(response.text).not.toContain(secret.slice("whsec_".length));
    }
    expect(org.keySuffix).toBe(FAKE_KEY.slice(-4));
    expect(org.keyEnv).toBe("live");
    const rows = await h.env.DB.prepare("SELECT * FROM orgs").all();
    const dump = JSON.stringify(rows.results);
    expect(dump).not.toContain(FAKE_KEY);
    expect(dump).not.toContain(secret.slice("whsec_".length));
  });

  it("hides other users' orgs behind 404 on every org route", async () => {
    const owner = await h.devLogin();
    const org = await createOrg(owner);
    const idToken = await h.identity.sign({
      issuer: "https://accounts.google.com",
      audience: GOOGLE_AUDIENCE,
      subject: "intruder",
    });
    const intruder = parse(
      SessionResponseSchema,
      await h.request("/v1/auth/google", { method: "POST", body: { idToken } }),
    ).token;
    const routes: [string, string, unknown?][] = [
      ["PATCH", `/v1/orgs/${org.id}`, { name: "Mine" }],
      ["PUT", `/v1/orgs/${org.id}/key`, { secretKey: FAKE_KEY }],
      ["PUT", `/v1/orgs/${org.id}/webhook-secret`, { signingSecret: randomWebhookSecret() }],
      ["POST", `/v1/orgs/${org.id}/test-push`],
      ["GET", `/v1/orgs/${org.id}/overview`],
      ["GET", `/v1/orgs/${org.id}/subscriptions`],
      ["GET", `/v1/orgs/${org.id}/purchases`],
      ["GET", `/v1/orgs/${org.id}/invoices`],
      ["GET", `/v1/orgs/${org.id}/invoices/inv_demo_1`],
      ["GET", `/v1/orgs/${org.id}/plans`],
      ["GET", `/v1/orgs/${org.id}/customers`],
      ["GET", `/v1/orgs/${org.id}/customers/cus_demo_1`],
      ["DELETE", `/v1/orgs/${org.id}`],
    ];
    for (const [method, path, body] of routes) {
      const response = await h.request(path, {
        method,
        token: intruder,
        ...(body ? { body } : {}),
      });
      expect(response.status, `${method} ${path}`).toBe(404);
    }
    expect(
      parse(OrgListResponseSchema, await h.request("/v1/orgs", { token: intruder })).orgs,
    ).toEqual([]);
    expect(
      parse(OrgListResponseSchema, await h.request("/v1/orgs", { token: owner })).orgs,
    ).toHaveLength(1);
  });

  it("renames, deletes, and rejects invalid bodies", async () => {
    const token = await h.devLogin();
    const org = await createOrg(token);
    expect(
      (await h.request(`/v1/orgs/${org.id}`, { method: "PATCH", token, body: { name: "" } }))
        .status,
    ).toBe(400);
    const renamed = parse(
      OrgResponseSchema,
      await h.request(`/v1/orgs/${org.id}`, {
        method: "PATCH",
        token,
        body: { name: "  New Name " },
      }),
    );
    expect(renamed.org.name).toBe("New Name");
    expect(renamed.org.webhookUrl).toMatch(
      /^https:\/\/worker\.test\/webhooks\/autumn\/[\w-]{20,}$/,
    );
    expect((await h.request(`/v1/orgs/${org.id}`, { method: "DELETE", token })).status).toBe(200);
    expect(parse(OrgListResponseSchema, await h.request("/v1/orgs", { token })).orgs).toEqual([]);
  });
});

describe("dashboard data", () => {
  it("returns contract-shaped data for every read route", async () => {
    const token = await h.devLogin();
    const org = await createOrg(token);
    const base = `/v1/orgs/${org.id}`;

    const overview = parse(OverviewResponseSchema, await h.request(`${base}/overview`, { token }));
    expect(overview.revenue.windowDays).toBe(30);
    expect(overview.revenue.series.map((series) => series.currency)).toEqual(["USD", "EUR"]);
    expect(overview.revenue.truncated).toBe(false);
    expect(overview.recentSubscriptions.length).toBeGreaterThan(0);
    expect(overview.recentOrders.every((invoice) => invoice.status !== "void")).toBe(true);
    const sortedOrders = [...overview.recentOrders].sort((a, b) => b.createdAt - a.createdAt);
    expect(overview.recentOrders).toEqual(sortedOrders);
    expect(overview.trialingSubscriptions).toBeGreaterThan(0);

    const subscriptions = parse(
      SubscriptionPageSchema,
      await h.request(`${base}/subscriptions`, { token }),
    );
    expect(new Set(subscriptions.items.map((sub) => sub.status))).toEqual(
      new Set(["trialing", "active", "canceling", "past_due"]),
    );
    expect(subscriptions.items.find((sub) => sub.customerId === "cus_demo_2")?.customerName).toBe(
      "Northwind",
    );

    parse(PurchasePageSchema, await h.request(`${base}/purchases`, { token }));
    const invoices = parse(InvoicePageSchema, await h.request(`${base}/invoices`, { token }));
    expect(invoices.nextCursor).not.toBeNull();
    const nextPage = parse(
      InvoicePageSchema,
      await h.request(`${base}/invoices?cursor=${invoices.nextCursor}`, { token }),
    );
    expect(nextPage.items[0]?.id).not.toBe(invoices.items[0]?.id);

    const plans = parse(PlanListResponseSchema, await h.request(`${base}/plans`, { token }));
    expect(plans.plans.find((plan) => plan.id === "free")?.isFree).toBe(true);
    expect(plans.plans.find((plan) => plan.id === "pro")?.freeTrial).toEqual({
      length: 14,
      unit: "day",
      cardRequired: true,
    });

    const search = parse(
      CustomerPageSchema,
      await h.request(`${base}/customers?search=hoo`, { token }),
    );
    expect(search.items.map((customer) => customer.name)).toEqual(["Hooli"]);

    const detail = parse(
      CustomerDetailSchema,
      await h.request(`${base}/customers/cus_demo_6`, { token }),
    );
    expect(detail.customer.name).toBe("Hooli");
    expect(detail.invoices.length).toBeGreaterThan(0);
    expect(detail.subscriptions[0]?.status).toBe("canceling");
    expect(JSON.stringify(detail)).not.toMatch(/email/i);

    const invoice = parse(
      InvoiceResponseSchema,
      await h.request(`${base}/invoices/inv_demo_3`, { token }),
    );
    expect(invoice.invoice.id).toBe("inv_demo_3");
    expect((await h.request(`${base}/invoices/inv_missing`, { token })).status).toBe(404);
    expect((await h.request(`${base}/customers/cus_missing`, { token })).status).toBe(404);
  });

  it("caches revenue briefly instead of re-reading every invoice", async () => {
    const token = await h.devLogin();
    const org = await createOrg(token);
    await h.request(`/v1/orgs/${org.id}/overview`, { token });
    const callsAfterFirst = h.fake.autumnCalls.filter(
      (call) => call === "/v1/invoices.list",
    ).length;
    await h.request(`/v1/orgs/${org.id}/overview`, { token });
    const callsAfterSecond = h.fake.autumnCalls.filter(
      (call) => call === "/v1/invoices.list",
    ).length;
    // The second overview only re-reads the recent-orders page, not the paid history.
    expect(callsAfterSecond - callsAfterFirst).toBe(1);
  });
});

describe("settings and devices", () => {
  it("starts from the defaults and merges partial updates", async () => {
    const token = await h.devLogin();
    const initial = parse(
      NotificationSettingsResponseSchema,
      await h.request("/v1/settings/notifications", { token }),
    );
    expect(initial.settings).toMatchObject({
      purchases: true,
      subscriptions: true,
      trials: true,
      renewals: false,
      cancellations: false,
      excludeFree: false,
    });
    const updated = parse(
      NotificationSettingsResponseSchema,
      await h.request("/v1/settings/notifications", {
        method: "PUT",
        token,
        body: { renewals: true, excludeFree: true },
      }),
    );
    expect(updated.settings).toMatchObject({ purchases: true, renewals: true, excludeFree: true });
    const again = parse(
      NotificationSettingsResponseSchema,
      await h.request("/v1/settings/notifications", { token }),
    );
    expect(again.settings).toEqual(updated.settings);
    expect(
      (
        await h.request("/v1/settings/notifications", {
          method: "PUT",
          token,
          body: { renewals: "yes" },
        })
      ).status,
    ).toBe(400);
  });

  it("registers Expo tokens and rejects anything else", async () => {
    const token = await h.devLogin();
    const good = await h.request("/v1/devices", {
      method: "POST",
      token,
      body: { expoPushToken: "ExponentPushToken[abc123]", platform: "ios" },
    });
    expect(good.status).toBe(200);
    const bad = await h.request("/v1/devices", {
      method: "POST",
      token,
      body: { expoPushToken: "abc", platform: "ios" },
    });
    expect(bad.status).toBe(400);
    const org = await createOrg(token);
    const sent = parse(
      TestPushResponseSchema,
      await h.request(`/v1/orgs/${org.id}/test-push`, { method: "POST", token }),
    );
    expect(sent.sent).toBe(1);
    expect(h.fake.pushes[0]).toMatchObject({
      to: "ExponentPushToken[abc123]",
      sound: "cha_ching.wav",
      channelId: `org-${org.id}`,
    });
    expect(
      (
        await h.request("/v1/devices", {
          method: "DELETE",
          token,
          body: { expoPushToken: "ExponentPushToken[abc123]" },
        })
      ).status,
    ).toBe(200);
    expect(
      parse(
        TestPushResponseSchema,
        await h.request(`/v1/orgs/${org.id}/test-push`, { method: "POST", token }),
      ).sent,
    ).toBe(0);
  });
});

describe("webhooks", () => {
  async function setup() {
    const token = await h.devLogin();
    const org = await createOrg(token);
    await h.request("/v1/devices", {
      method: "POST",
      token,
      body: { expoPushToken: "ExpoPushToken[phone]", platform: "android" },
    });
    const secret = randomWebhookSecret();
    await h.request(`/v1/orgs/${org.id}/webhook-secret`, {
      method: "PUT",
      token,
      body: { signingSecret: secret },
    });
    const webhookPath = new URL(org.webhookUrl).pathname;
    return { token, org, secret, webhookPath };
  }

  async function deliver(args: {
    path: string;
    secret: string;
    id: string;
    payload: unknown;
    timestamp?: number;
  }) {
    const body = JSON.stringify(args.payload);
    const timestamp = args.timestamp ?? Math.floor(NOW / 1000);
    return h.request(args.path, {
      method: "POST",
      rawBody: body,
      headers: {
        "content-type": "application/json",
        "svix-id": args.id,
        "svix-timestamp": String(timestamp),
        "svix-signature": await signSvix({ secret: args.secret, id: args.id, timestamp, body }),
      },
    });
  }

  const newSubscription = {
    type: "billing.updated",
    data: {
      object: "billing.updated",
      customer_id: "cus_demo_2",
      plan_changes: [
        {
          action: "activated",
          subscription: {
            plan_id: "team",
            status: "active",
            past_due: false,
            started_at: NOW,
            canceled_at: null,
            expires_at: null,
            trial_ends_at: null,
            current_period_start: NOW,
            current_period_end: NOW,
          },
          previous_attributes: null,
          item_changes: [],
        },
      ],
      tags: [],
    },
  };

  it("pushes a verified sale to the owner's devices", async () => {
    const { org, secret, webhookPath } = await setup();
    const response = await deliver({
      path: webhookPath,
      secret,
      id: "msg_1",
      payload: newSubscription,
    });
    expect(response.status).toBe(200);
    expect(h.fake.pushes).toHaveLength(1);
    expect(h.fake.pushes[0]).toMatchObject({
      to: "ExpoPushToken[phone]",
      title: "New subscription · $99 Team",
      body: "Northwind · Acme Cloud",
      sound: "cha_ching.wav",
      channelId: `org-${org.id}`,
      threadId: `org-${org.id}`,
    });
    const orgs = parse(
      OrgListResponseSchema,
      await h.request("/v1/orgs", { token: await h.devLogin() }),
    ).orgs;
    expect(orgs[0]?.lastWebhookAt).toBe(NOW);
  });

  it("ignores replays of the same svix-id", async () => {
    const { secret, webhookPath } = await setup();
    await deliver({ path: webhookPath, secret, id: "msg_dup", payload: newSubscription });
    const replay = await deliver({
      path: webhookPath,
      secret,
      id: "msg_dup",
      payload: newSubscription,
    });
    expect(replay.status).toBe(200);
    expect(h.fake.pushes).toHaveLength(1);
  });

  it("rejects unknown webhooks, missing secrets, missing headers and bad signatures", async () => {
    const token = await h.devLogin();
    const bare = await createOrg(token, "No Secret Yet");
    const barePath = new URL(bare.webhookUrl).pathname;
    expect(
      (
        await deliver({
          path: "/webhooks/autumn/unknown",
          secret: randomWebhookSecret(),
          id: "m",
          payload: newSubscription,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await deliver({
          path: barePath,
          secret: randomWebhookSecret(),
          id: "m",
          payload: newSubscription,
        })
      ).status,
    ).toBe(400);

    const { secret, webhookPath } = await setup();
    expect((await h.request(webhookPath, { method: "POST", rawBody: "{}" })).status).toBe(400);
    expect(
      (
        await deliver({
          path: webhookPath,
          secret: randomWebhookSecret(),
          id: "m2",
          payload: newSubscription,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await deliver({
          path: webhookPath,
          secret,
          id: "m3",
          payload: newSubscription,
          timestamp: Math.floor(NOW / 1000) - 600,
        })
      ).status,
    ).toBe(400);
    expect(h.fake.pushes).toHaveLength(0);
  });

  it("respects the user's settings", async () => {
    const { token, secret, webhookPath } = await setup();
    await h.request("/v1/settings/notifications", {
      method: "PUT",
      token,
      body: { subscriptions: false },
    });
    expect(
      (await deliver({ path: webhookPath, secret, id: "msg_off", payload: newSubscription }))
        .status,
    ).toBe(200);
    expect(h.fake.pushes).toHaveLength(0);
  });

  it("announces renewals from invoice.finalized only after the first period", async () => {
    const { token, secret, webhookPath } = await setup();
    await h.request("/v1/settings/notifications", {
      method: "PUT",
      token,
      body: { renewals: true },
    });
    const invoice = h.fake.data.invoices.find(
      (row) => row.customer_id === "cus_demo_2" && row.plan_ids[0] === "pro",
    );
    expect(invoice).toBeDefined();
    const renewal = {
      ...invoice,
      id: "inv_renewal",
      plan_ids: ["team"],
      total: 99,
      created_at: NOW,
    };
    await deliver({
      path: webhookPath,
      secret,
      id: "msg_renewal",
      payload: { type: "invoice.finalized", data: renewal },
    });
    expect(h.fake.pushes.map((push) => push.title)).toEqual(["Renewal · $99 Team"]);

    const firstInvoiceTime =
      h.fake.data.subscriptions.find((sub) => sub.customer_id === "cus_demo_2")!.started_at +
      60_000;
    const first = { ...renewal, id: "inv_first", created_at: firstInvoiceTime };
    await deliver({
      path: webhookPath,
      secret,
      id: "msg_first",
      payload: { type: "invoice.finalized", data: first },
    });
    expect(h.fake.pushes).toHaveLength(1);
  });

  it("acknowledges event types it doesn't push for", async () => {
    const { secret, webhookPath } = await setup();
    const response = await deliver({
      path: webhookPath,
      secret,
      id: "msg_limit",
      payload: {
        type: "balances.limit_reached",
        data: { customer_id: "cus_demo_1", feature_id: "api", limit_type: "included" },
      },
    });
    expect(response.status).toBe(200);
    expect(h.fake.pushes).toHaveLength(0);
  });

  it("removes devices Expo reports as unregistered", async () => {
    const { secret, webhookPath } = await setup();
    h.fake.unregisteredTokens.add("ExpoPushToken[phone]");
    await deliver({ path: webhookPath, secret, id: "msg_gone", payload: newSubscription });
    const rows = await h.env.DB.prepare("SELECT COUNT(*) AS n FROM devices").first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
