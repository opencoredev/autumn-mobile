import { describe, expect, it } from "vitest";
import { createAutumnClient, READ_ONLY_AUTUMN_PATHS } from "../src/autumn/client";
import { deriveStatus, planView } from "../src/autumn/mappers";
import { PlanRaw, SubscriptionRaw } from "../src/autumn/schemas";
import { keyEnvironment } from "../src/env";
import { HttpError } from "../src/http";

const KEY = ["am", "sk", "test", "client", "0001"].join("_");

function recordingFetch(status = 200, body: unknown = { list: [] }) {
  const calls: { url: string; headers: Headers; body: string }[] = [];
  const impl: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, headers: request.headers, body: await request.text() });
    return Response.json(body, { status });
  };
  return { calls, impl };
}

describe("Autumn client", () => {
  it("only allows the six read endpoints", async () => {
    expect(READ_ONLY_AUTUMN_PATHS).toEqual([
      "/v1/invoices.list",
      "/v1/subscriptions.list",
      "/v1/purchases.list",
      "/v1/customers.list",
      "/v1/customers.get",
      "/v1/plans.list",
    ]);
    const { calls, impl } = recordingFetch();
    const client = createAutumnClient({
      baseUrl: "https://autumn.fake",
      secretKey: KEY,
      fetch: impl,
    });
    for (const path of [
      "/v1/customers.delete",
      "/v1/billing.attach",
      "/v1/plans.create",
      "/v1/balances.track",
    ]) {
      await expect(client.post(path, {})).rejects.toBeInstanceOf(HttpError);
    }
    expect(calls).toHaveLength(0);
  });

  it("sends the bearer key and API version header", async () => {
    const { calls, impl } = recordingFetch();
    const client = createAutumnClient({
      baseUrl: "https://autumn.fake/",
      secretKey: KEY,
      fetch: impl,
    });
    await client.listPlans();
    expect(calls[0]?.url).toBe("https://autumn.fake/v1/plans.list");
    expect(calls[0]?.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(calls[0]?.headers.get("x-api-version")).toBe("2.5.0");
  });

  it("maps auth failures, missing records and outages to error codes", async () => {
    const cases: [number, string][] = [
      [401, "invalid_autumn_key"],
      [403, "invalid_autumn_key"],
      [404, "not_found"],
      [500, "autumn_unavailable"],
      [429, "autumn_unavailable"],
    ];
    for (const [status, code] of cases) {
      const client = createAutumnClient({
        baseUrl: "https://a.fake",
        secretKey: KEY,
        fetch: recordingFetch(status).impl,
      });
      await expect(client.listPlans()).rejects.toMatchObject({ code });
    }
    const offline = createAutumnClient({
      baseUrl: "https://a.fake",
      secretKey: KEY,
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    await expect(offline.listPlans()).rejects.toMatchObject({ code: "autumn_unavailable" });
  });

  it("drops malformed rows instead of failing the whole list", async () => {
    const client = createAutumnClient({
      baseUrl: "https://a.fake",
      secretKey: KEY,
      fetch: recordingFetch(200, { list: [{ id: "ok", name: "Ok" }, { nope: true }] }).impl,
    });
    expect((await client.listPlans()).map((plan) => plan.id)).toEqual(["ok"]);
  });
});

describe("mappers", () => {
  const NOW = 1_000_000;
  const base = SubscriptionRaw.parse({ id: "s", plan_id: "p", started_at: 0, status: "active" });

  it("derives display status in priority order", () => {
    expect(deriveStatus(base, NOW)).toBe("active");
    expect(deriveStatus({ ...base, trial_ends_at: NOW + 1 }, NOW)).toBe("trialing");
    expect(deriveStatus({ ...base, canceled_at: NOW - 1 }, NOW)).toBe("canceling");
    expect(deriveStatus({ ...base, past_due: true, trial_ends_at: NOW + 1 }, NOW)).toBe("past_due");
    expect(deriveStatus({ ...base, status: "scheduled" }, NOW)).toBe("scheduled");
    expect(deriveStatus({ ...base, status: "expired" }, NOW)).toBe("expired");
    expect(deriveStatus({ ...base, expires_at: NOW - 1 }, NOW)).toBe("expired");
  });

  it("treats a plan as free only when nothing it contains charges", () => {
    const free = planView(
      PlanRaw.parse({ id: "f", name: "Free", price: null, items: [{ price: null }] }),
    );
    const zeroBaseWithUsage = planView(
      PlanRaw.parse({
        id: "u",
        name: "Usage",
        price: { amount: 0, interval: "month" },
        items: [{ price: { amount: 0.02 } }],
      }),
    );
    const tiered = planView(
      PlanRaw.parse({
        id: "t",
        name: "Tiered",
        items: [{ price: { tiers: [{ amount: 0 }, { amount: 5 }] } }],
      }),
    );
    expect(free.isFree).toBe(true);
    expect(zeroBaseWithUsage.isFree).toBe(false);
    expect(tiered.isFree).toBe(false);
  });

  it("reads the key environment from the key prefix", () => {
    expect(keyEnvironment(["am", "sk", "live", "x"].join("_"))).toBe("live");
    expect(keyEnvironment(["am", "sk", "test", "x"].join("_"))).toBe("sandbox");
    expect(keyEnvironment("something_else")).toBe("live");
  });
});
