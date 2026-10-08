import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { z } from "zod";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type User,
  type Org,
  type Plan,
  type Subscription,
  type Purchase,
  type Invoice,
  type Money,
  type NotificationSettings,
  type ErrorCode,
} from "@autumn/shared";
import {
  encryptSecret,
  decryptSecret,
  importEncryptionKey,
  randomToken,
  sha256,
  verifySvix,
} from "./crypto";
import { summarizeRevenue } from "./revenue";
import { classifyEvent, type PlanInfo } from "./notifications";

const app = new Hono<{ Bindings: Env; Variables: { user: User } }>();
const now = () => Date.now();

const b64Json = (value: unknown): string => JSON.stringify(value);
const AutumnEnvelope = z
  .object({
    list: z.array(z.unknown()).default([]),
    next_cursor: z.string().nullable().optional(),
    has_more: z.boolean().optional(),
  })
  .passthrough();
const PlanRaw = z
  .object({
    id: z.string(),
    name: z.string().default(""),
    description: z.string().nullable().optional(),
    group: z.string().nullable().optional(),
    version: z.number().default(1),
    add_on: z.boolean().default(false),
    auto_enable: z.boolean().default(false),
    archived: z.boolean().default(false),
    price: z
      .object({
        amount: z.number(),
        interval: z.enum(["one_off", "week", "month", "quarter", "semi_annual", "year"]),
      })
      .nullable()
      .optional(),
    items: z
      .array(
        z.object({ price: z.object({ amount: z.number() }).nullable().optional() }).passthrough(),
      )
      .default([]),
    free_trial: z
      .object({
        duration_length: z.number(),
        duration_type: z.enum(["day", "month", "year"]),
        card_required: z.boolean().default(false),
      })
      .nullable()
      .optional(),
    created_at: z.number().default(0),
  })
  .passthrough();
const InvoiceRaw = z
  .object({
    id: z.string(),
    customer_id: z.string().nullable().optional(),
    plan_ids: z.array(z.string()).default([]),
    status: z.enum(["draft", "open", "void", "paid", "uncollectible"]),
    total: z.number(),
    amount_paid: z.number().nullable().optional(),
    refunded_amount: z.number().default(0),
    currency: z.string().default("usd"),
    created_at: z.number(),
    hosted_invoice_url: z.string().nullable().optional(),
    items: z
      .array(
        z
          .object({
            id: z.string(),
            description: z.string().default(""),
            plan_id: z.string().nullable().optional(),
            feature_name: z.string().nullable().optional(),
            quantity: z.number().nullable().optional(),
            amount: z.number().default(0),
            period_start: z.number().nullable().optional(),
            period_end: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();
const SubRaw = z
  .object({
    id: z.string(),
    plan_id: z.string(),
    auto_enable: z.boolean().default(false),
    add_on: z.boolean().default(false),
    past_due: z.boolean().default(false),
    canceled_at: z.number().nullable().optional(),
    expires_at: z.number().nullable().optional(),
    trial_ends_at: z.number().nullable().optional(),
    started_at: z.number(),
    current_period_end: z.number().nullable().optional(),
    quantity: z.number().default(1),
    status: z.enum(["active", "scheduled", "past_due", "expired"]),
    customer_id: z.string(),
    created_at: z.number(),
  })
  .passthrough();
const PurchaseRaw = z
  .object({
    id: z.string(),
    plan_id: z.string(),
    expires_at: z.number().nullable().optional(),
    started_at: z.number(),
    quantity: z.number().default(1),
    status: z.enum(["active", "scheduled", "expired"]),
    customer_id: z.string(),
    created_at: z.number(),
  })
  .passthrough();
const CustomerRaw = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable().optional(),
    created_at: z.number().default(0),
    env: z.enum(["sandbox", "live"]).default("live"),
    stripe_id: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    subscriptions: z.array(SubRaw.omit({ customer_id: true })).default([]),
    purchases: z.array(PurchaseRaw.omit({ customer_id: true })).default([]),
    invoices: z.array(InvoiceRaw).optional(),
  })
  .passthrough();

type RawPlan = z.infer<typeof PlanRaw>;
type RawInvoice = z.infer<typeof InvoiceRaw>;
type RawSub = z.infer<typeof SubRaw>;
type RawPurchase = z.infer<typeof PurchaseRaw>;
function errorStatus(code: ErrorCode): number {
  return code === "unauthorized"
    ? 401
    : code === "not_found"
      ? 404
      : code === "invalid_signature"
        ? 400
        : code === "invalid_autumn_key" || code === "invalid_request"
          ? 400
          : code === "autumn_unavailable"
            ? 503
            : 500;
}
function fail(c: any, code: ErrorCode, message: string): Response {
  return c.json({ error: { code, message } }, errorStatus(code));
}
function parseBody<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
function envOf(key: string): "live" | "sandbox" {
  return key.includes("_test_") ? "sandbox" : "live";
}
function orgView(row: Record<string, unknown>, c: any): Org {
  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  return {
    id: String(row.id) as Org["id"],
    name: String(row.name),
    keySuffix: String(row.key_suffix),
    keyEnv: row.key_env === "sandbox" ? "sandbox" : "live",
    webhookUrl: `${base}/webhooks/autumn/${String(row.webhook_id)}`,
    hasWebhookSecret: row.webhook_secret_ciphertext != null,
    lastWebhookAt: typeof row.last_webhook_at === "number" ? row.last_webhook_at : null,
    createdAt: Number(row.created_at),
  } satisfies Org;
}
async function autumn(c: any, key: string, path: string, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${c.env.AUTUMN_API_BASE || "https://api.useautumn.com"}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-api-version": "2.5.0",
      },
      body: b64Json(body),
    });
  } catch {
    throw new Error("autumn_unavailable");
  }
  if (response.status === 401 || response.status === 403) throw new Error("invalid_autumn_key");
  if (!response.ok)
    throw new Error(response.status >= 500 ? "autumn_unavailable" : "invalid_request");
  return response.json();
}
async function getOrg(c: any, id: string): Promise<Record<string, unknown> | null> {
  const row = await c.env.DB.prepare("SELECT * FROM orgs WHERE id = ? AND user_id = ?")
    .bind(id, c.get("user").id)
    .first();
  return row ? (row as Record<string, unknown>) : null;
}
async function keyFor(c: any, row: Record<string, unknown>): Promise<string> {
  const key = await importEncryptionKey(c.env.KEY_ENCRYPTION_KEY);
  return decryptSecret({
    ciphertext: String(row.key_ciphertext),
    iv: String(row.key_iv),
    key,
    aad: `${c.get("user").id}:${String(row.id)}:autumn-key`,
  });
}
function money(amount: number, currency: string): Money {
  return { amount, currency: currency.toLowerCase() } satisfies Money;
}
function planView(raw: RawPlan, _currency = "usd"): Plan {
  const positiveItem = raw.items.some((item) => (item.price?.amount ?? 0) > 0);
  const isFree = raw.price == null || (raw.price.amount === 0 && !positiveItem);
  const interval = raw.price?.interval;
  const validInterval = ["one_off", "week", "month", "quarter", "semi_annual", "year"].includes(
    interval ?? "",
  )
    ? interval
    : undefined;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? null,
    group: raw.group ?? null,
    version: raw.version,
    addOn: raw.add_on,
    autoEnable: raw.auto_enable,
    archived: raw.archived,
    price:
      raw.price && validInterval ? { amount: raw.price.amount, interval: validInterval } : null,
    isFree,
    freeTrial: raw.free_trial
      ? {
          length: raw.free_trial.duration_length,
          unit: raw.free_trial.duration_type,
          cardRequired: raw.free_trial.card_required,
        }
      : null,
    itemCount: raw.items.length,
    createdAt: raw.created_at,
  } satisfies Plan;
}
function deriveStatus(raw: RawSub, at: number): Subscription["status"] {
  if (raw.status === "expired" || (raw.expires_at != null && raw.expires_at <= at))
    return "expired";
  if (raw.status === "scheduled") return "scheduled";
  if (raw.status === "past_due" || raw.past_due) return "past_due";
  if (raw.trial_ends_at != null && raw.trial_ends_at > at) return "trialing";
  if (raw.canceled_at != null) return "canceling";
  return "active";
}
function subView(
  raw: RawSub,
  plans: Map<string, Plan>,
  names: Map<string, string>,
  currency: string,
  at: number,
): Subscription {
  const plan = plans.get(raw.plan_id);
  return {
    id: raw.id,
    planId: raw.plan_id,
    planName: plan?.name ?? raw.plan_id,
    customerId: raw.customer_id,
    customerName: names.get(raw.customer_id) ?? null,
    status: deriveStatus(raw, at),
    addOn: raw.add_on || plan?.addOn === true,
    quantity: raw.quantity,
    price: plan?.price && !plan.isFree ? money(plan.price.amount * raw.quantity, currency) : null,
    interval: plan?.price?.interval ?? null,
    startedAt: raw.started_at,
    trialEndsAt: raw.trial_ends_at ?? null,
    canceledAt: raw.canceled_at ?? null,
    currentPeriodEnd: raw.current_period_end ?? null,
    createdAt: raw.created_at,
  } satisfies Subscription;
}
function purchaseView(
  raw: RawPurchase,
  plans: Map<string, Plan>,
  names: Map<string, string>,
  currency: string,
): Purchase {
  const plan = plans.get(raw.plan_id);
  return {
    id: raw.id,
    planId: raw.plan_id,
    planName: plan?.name ?? raw.plan_id,
    customerId: raw.customer_id,
    customerName: names.get(raw.customer_id) ?? null,
    status: raw.status,
    quantity: raw.quantity,
    price: plan?.price && !plan.isFree ? money(plan.price.amount * raw.quantity, currency) : null,
    startedAt: raw.started_at,
    createdAt: raw.created_at,
  } satisfies Purchase;
}
function invoiceView(
  raw: RawInvoice,
  plans: Map<string, Plan>,
  names: Map<string, string>,
): Invoice {
  const currency = raw.currency.toLowerCase();
  return {
    id: raw.id,
    customerId: raw.customer_id ?? null,
    customerName: raw.customer_id ? (names.get(raw.customer_id) ?? null) : null,
    planIds: raw.plan_ids,
    planNames: raw.plan_ids.map((id) => plans.get(id)?.name ?? id),
    status: raw.status,
    total: money(raw.total, currency),
    netPaid:
      raw.status === "paid"
        ? money((raw.amount_paid ?? raw.total) - raw.refunded_amount, currency)
        : null,
    refunded: raw.refunded_amount,
    hostedInvoiceUrl: raw.hosted_invoice_url ?? null,
    createdAt: raw.created_at,
    lines: raw.items.map((item) => ({
      id: item.id,
      description: item.description,
      planId: item.plan_id ?? null,
      featureName: item.feature_name ?? null,
      quantity: item.quantity ?? null,
      amount: item.amount,
      periodStart: item.period_start ?? null,
      periodEnd: item.period_end ?? null,
    })),
  } satisfies Invoice;
}
async function plansFor(c: any, row: Record<string, unknown>): Promise<Map<string, Plan>> {
  const cacheKey = `plans:${row.id}`;
  const cached = await c.env.CACHE?.get(cacheKey);
  if (cached) {
    const parsed = parseBody(
      z.array(z.object({ id: z.string() }).passthrough()),
      JSON.parse(cached),
    );
    if (parsed) return new Map(parsed.map((p) => [p.id, p as unknown as Plan]));
  }
  const key = await keyFor(c, row);
  const payload = await autumn(c, key, "/v1/plans.list", { include_archived: false });
  const envelope = parseBody(AutumnEnvelope, payload);
  if (!envelope) throw new Error("invalid_request");
  const list = envelope.list.flatMap((x) => {
    const p = PlanRaw.safeParse(x);
    return p.success ? [planView(p.data)] : [];
  });
  await c.env.CACHE?.put(cacheKey, JSON.stringify(list), { expirationTtl: 600 });
  return new Map(list.map((p) => [p.id, p]));
}
async function requireAuth(c: any, next: () => Promise<void>): Promise<void> {
  if (c.req.path.startsWith("/v1/auth/")) return next();
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer "))
    return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  const hash = await sha256(header.slice(7));
  const row = await c.env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ",
  )
    .bind(hash, now())
    .first();
  if (!row) return c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401);
  const user: User = {
    id: String(row.id),
    provider: row.provider === "apple" ? "apple" : "google",
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    createdAt: Number(row.created_at),
  };
  c.set("user", user);
  return next();
}
app.use(
  "/v1/*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);
app.use("/v1/*", requireAuth);
app.get("/health", (c) => c.json({ status: "ok" }));
app.post("/v1/auth/dev", async (c) => {
  if (c.env.ALLOW_DEV_LOGIN !== "true") return c.notFound();
  const userId = "dev-user";
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO users(id,provider,provider_subject,display_name,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(userId, "google", userId, "Dev User", now())
    .run();
  return issueSession(c, userId);
});
async function issueSession(c: any, userId: string): Promise<Response> {
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!row) return fail(c, "internal", "User missing");
  const token = randomToken();
  const expiresAt = now() + 60 * 86400000;
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)",
  )
    .bind(await sha256(token), userId, now(), expiresAt)
    .run();
  const user: User = {
    id: String(row.id),
    provider: row.provider === "apple" ? "apple" : "google",
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    createdAt: Number(row.created_at),
  };
  return c.json({ token, expiresAt, user });
}
async function oauth(
  c: any,
  provider: "google" | "apple",
  token: string,
  displayName: string | null,
): Promise<Response> {
  try {
    const jwks = createRemoteJWKSet(
      new URL(
        provider === "google"
          ? "https://www.googleapis.com/oauth2/v3/certs"
          : "https://appleid.apple.com/auth/keys",
      ),
    );
    const issuers =
      provider === "google"
        ? ["accounts.google.com", "https://accounts.google.com"]
        : ["https://appleid.apple.com"];
    const verified = await jwtVerify(token, jwks, {
      issuer: issuers,
      audience: (provider === "google" ? c.env.GOOGLE_CLIENT_IDS : c.env.APPLE_AUDIENCES)
        .split(",")
        .map((x: string) => x.trim())
        .filter(Boolean),
    });
    const subject = verified.payload.sub;
    if (!subject) return fail(c, "invalid_request", "Invalid identity token");
    const existing = await c.env.DB.prepare(
      "SELECT * FROM users WHERE provider=? AND provider_subject=?",
    )
      .bind(provider, subject)
      .first();
    const userId = existing ? String(existing.id) : randomToken(16);
    if (!existing)
      await c.env.DB.prepare(
        "INSERT INTO users(id,provider,provider_subject,display_name,created_at) VALUES(?,?,?,?,?)",
      )
        .bind(userId, provider, subject, displayName, now())
        .run();
    else if (displayName && !existing.display_name)
      await c.env.DB.prepare("UPDATE users SET display_name=? WHERE id=?")
        .bind(displayName, userId)
        .run();
    return issueSession(c, userId);
  } catch {
    return fail(c, "invalid_request", "Invalid identity token");
  }
}
app.post("/v1/auth/google", async (c) => {
  const body = parseBody(
    z.object({ idToken: z.string().min(1) }),
    await c.req.json().catch(() => null),
  );
  return body
    ? oauth(c, "google", body.idToken, null)
    : fail(c, "invalid_request", "Invalid request");
});
app.post("/v1/auth/apple", async (c) => {
  const body = parseBody(
    z.object({ identityToken: z.string().min(1), displayName: z.string().nullable() }),
    await c.req.json().catch(() => null),
  );
  return body
    ? oauth(c, "apple", body.identityToken, body.displayName)
    : fail(c, "invalid_request", "Invalid request");
});
app.post("/v1/auth/logout", async (c) => {
  const h = c.req.header("authorization");
  if (h)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(h.slice(7)))
      .run();
  return c.json({ ok: true });
});
app.get("/v1/me", (c) => c.json({ user: c.get("user") }));
app.get("/v1/orgs", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM orgs WHERE user_id=? ORDER BY created_at DESC")
    .bind(c.get("user").id)
    .all();
  return c.json({ orgs: rows.results.map((r) => orgView(r, c)) });
});
app.post("/v1/orgs", async (c) => {
  const body = parseBody(
    z.object({
      name: z.string().trim().min(1).max(60),
      secretKey: z.string().trim().min(8).max(512),
    }),
    await c.req.json().catch(() => null),
  );
  if (!body) return fail(c, "invalid_request", "Invalid request");
  try {
    await autumn(c, body.secretKey, "/v1/plans.list", { include_archived: false });
    const id = randomToken(16),
      webhookId = randomToken(24),
      key = await importEncryptionKey(c.env.KEY_ENCRYPTION_KEY),
      encrypted = await encryptSecret({
        value: body.secretKey,
        key,
        aad: `${c.get("user").id}:${id}:autumn-key`,
      });
    await c.env.DB.prepare(
      "INSERT INTO orgs(id,user_id,name,key_ciphertext,key_iv,key_version,key_suffix,key_env,webhook_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        c.get("user").id,
        body.name,
        encrypted.ciphertext,
        encrypted.iv,
        1,
        body.secretKey.slice(-4),
        envOf(body.secretKey),
        webhookId,
        now(),
        now(),
      )
      .run();
    const row = await getOrg(c, id);
    return row ? c.json({ org: orgView(row, c) }) : fail(c, "internal", "Unable to create org");
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to validate Autumn key",
    );
  }
});
app.patch("/v1/orgs/:id", async (c) => {
  const body = parseBody(
    z.object({ name: z.string().trim().min(1).max(60) }),
    await c.req.json().catch(() => null),
  );
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  if (!body) return fail(c, "invalid_request", "Invalid request");
  await c.env.DB.prepare("UPDATE orgs SET name=?,updated_at=? WHERE id=?")
    .bind(body.name, now(), String(row.id))
    .run();
  const next = await getOrg(c, String(row.id));
  return next ? c.json({ org: orgView(next, c) }) : fail(c, "internal", "Unable to update org");
});
app.put("/v1/orgs/:id/key", async (c) => {
  const body = parseBody(
    z.object({ secretKey: z.string().trim().min(8).max(512) }),
    await c.req.json().catch(() => null),
  );
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  if (!body) return fail(c, "invalid_request", "Invalid request");
  try {
    await autumn(c, body.secretKey, "/v1/plans.list", { include_archived: false });
    const key = await importEncryptionKey(c.env.KEY_ENCRYPTION_KEY);
    const enc = await encryptSecret({
      value: body.secretKey,
      key,
      aad: `${c.get("user").id}:${row.id}:autumn-key`,
    });
    await c.env.DB.prepare(
      "UPDATE orgs SET key_ciphertext=?,key_iv=?,key_suffix=?,key_env=?,key_version=key_version+1,updated_at=? WHERE id=?",
    )
      .bind(enc.ciphertext, enc.iv, body.secretKey.slice(-4), envOf(body.secretKey), now(), row.id)
      .run();
    const next = await getOrg(c, String(row.id));
    return next ? c.json({ org: orgView(next, c) }) : fail(c, "internal", "Unable to update org");
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to validate Autumn key",
    );
  }
});
app.put("/v1/orgs/:id/webhook-secret", async (c) => {
  const body = parseBody(
    z.object({ signingSecret: z.string().startsWith("whsec_").min(10) }),
    await c.req.json().catch(() => null),
  );
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  if (!body) return fail(c, "invalid_request", "Invalid request");
  const key = await importEncryptionKey(c.env.KEY_ENCRYPTION_KEY);
  const enc = await encryptSecret({
    value: body.signingSecret,
    key,
    aad: `${c.get("user").id}:${row.id}:webhook-secret`,
  });
  await c.env.DB.prepare(
    "UPDATE orgs SET webhook_secret_ciphertext=?,webhook_secret_iv=?,updated_at=? WHERE id=?",
  )
    .bind(enc.ciphertext, enc.iv, now(), row.id)
    .run();
  const next = await getOrg(c, String(row.id));
  return next ? c.json({ org: orgView(next, c) }) : fail(c, "internal", "Unable to update org");
});
app.delete("/v1/orgs/:id", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  await c.env.DB.prepare("DELETE FROM orgs WHERE id=?").bind(row.id).run();
  await c.env.CACHE?.delete(`plans:${row.id}`);
  await c.env.CACHE?.delete(`revenue:${row.id}`);
  return c.json({ ok: true });
});
async function namesFor(c: any, key: string): Promise<Map<string, string>> {
  try {
    const payload = await autumn(c, key, "/v1/customers.list", { limit: 200, sort_order: "desc" });
    const e = parseBody(AutumnEnvelope, payload);
    const out = new Map<string, string>();
    for (const x of e?.list ?? []) {
      const r = CustomerRaw.safeParse(x);
      if (r.success && r.data.id && r.data.name) out.set(r.data.id, r.data.name);
    }
    return out;
  } catch {
    return new Map();
  }
}
async function pageRaw(
  c: any,
  row: Record<string, unknown>,
  kind: "subscriptions" | "purchases" | "invoices",
  cursor: string | null,
): Promise<{ items: unknown[]; next: string | null }> {
  const key = await keyFor(c, row);
  let next = cursor;
  const all: unknown[] = [];
  for (let i = 0; i < 5; i += 1) {
    const body = { limit: 50, ...(next ? { start_cursor: next } : {}) };
    const payload = await autumn(c, key, `/v1/${kind}.list`, body);
    const e = parseBody(AutumnEnvelope, payload);
    if (!e) break;
    all.push(...e.list);
    next = e.next_cursor ?? null;
    if (kind === "invoices" || !e.has_more || all.length > 0) break;
  }
  return { items: all, next };
}
app.get("/v1/orgs/:id/plans", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    return c.json({ plans: [...(await plansFor(c, row))].map(([, p]) => p) });
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to load plans",
    );
  }
});
app.get("/v1/orgs/:id/subscriptions", async (c) => listMapped(c, "subscriptions"));
app.get("/v1/orgs/:id/purchases", async (c) => listMapped(c, "purchases"));
app.get("/v1/orgs/:id/invoices", async (c) => listMapped(c, "invoices"));
async function listMapped(
  c: any,
  kind: "subscriptions" | "purchases" | "invoices",
): Promise<Response> {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    const raw = await pageRaw(c, row, kind, c.req.query("cursor") ?? null),
      plans = await plansFor(c, row),
      names = await namesFor(c, await keyFor(c, row)),
      currency = "usd";
    let items: unknown[] = [];
    if (kind === "subscriptions")
      items = raw.items.flatMap((x) => {
        const p = SubRaw.safeParse(x);
        return p.success ? [subView(p.data, plans, names, currency, now())] : [];
      });
    if (kind === "purchases")
      items = raw.items.flatMap((x) => {
        const p = PurchaseRaw.safeParse(x);
        return p.success ? [purchaseView(p.data, plans, names, currency)] : [];
      });
    if (kind === "invoices")
      items = raw.items.flatMap((x) => {
        const p = InvoiceRaw.safeParse(x);
        return p.success ? [invoiceView(p.data, plans, names)] : [];
      });
    return c.json({ items, nextCursor: raw.next });
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to load data",
    );
  }
}
app.get("/v1/orgs/:id/invoices/:invoiceId", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    const key = await keyFor(c, row),
      payload = await autumn(c, key, "/v1/invoices.list", { invoice_id: c.req.param("invoiceId") }),
      e = parseBody(AutumnEnvelope, payload),
      raw = e?.list[0],
      parsed = raw ? InvoiceRaw.safeParse(raw) : null;
    if (!parsed?.success) return fail(c, "not_found", "Invoice not found");
    const plans = await plansFor(c, row),
      names = await namesFor(c, key);
    return c.json({ invoice: invoiceView(parsed.data, plans, names) });
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to load invoice",
    );
  }
});
app.get("/v1/orgs/:id/overview", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    const key = await keyFor(c, row),
      plans = await plansFor(c, row),
      names = await namesFor(c, key);
    const invPayload = await autumn(c, key, "/v1/invoices.list", { limit: 1000 }),
      invE = parseBody(AutumnEnvelope, invPayload),
      rawInvoices = (invE?.list ?? []).flatMap((x) => {
        const p = InvoiceRaw.safeParse(x);
        return p.success ? [p.data] : [];
      });
    const subPayload = await autumn(c, key, "/v1/subscriptions.list", { limit: 200 }),
      subE = parseBody(AutumnEnvelope, subPayload),
      rawSubs = (subE?.list ?? []).flatMap((x) => {
        const p = SubRaw.safeParse(x);
        return p.success ? [p.data] : [];
      });
    const invoices = rawInvoices.map((x) => invoiceView(x, plans, names)),
      subs = rawSubs.map((x) => subView(x, plans, names, "usd", now()));
    const revenue = summarizeRevenue({
      invoices: rawInvoices.map((x) => ({
        status: x.status,
        createdAt: x.created_at,
        total: x.total,
        amountPaid: x.amount_paid ?? null,
        refundedAmount: x.refunded_amount,
        currency: x.currency,
      })),
      now: now(),
      windowDays: 30,
    });
    return c.json({
      revenue,
      activeSubscriptions: subs.filter((x) => x.status === "active" || x.status === "canceling")
        .length,
      trialingSubscriptions: subs.filter((x) => x.status === "trialing").length,
      recentSubscriptions: [...subs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10),
      recentOrders: invoices
        .filter((x) => x.status !== "draft" && x.status !== "void")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10),
    });
  } catch (e) {
    return fail(
      c,
      e instanceof Error && e.message === "invalid_autumn_key"
        ? "invalid_autumn_key"
        : "autumn_unavailable",
      "Unable to load overview",
    );
  }
});
app.get("/v1/orgs/:id/customers", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    const key = await keyFor(c, row),
      payload = await autumn(c, key, "/v1/customers.list", {
        limit: 50,
        search: c.req.query("search") || "",
        start_cursor: c.req.query("cursor") || "",
        sort_order: "desc",
      }),
      e = parseBody(AutumnEnvelope, payload),
      plans = await plansFor(c, row),
      items = (e?.list ?? []).flatMap((x) => {
        const r = CustomerRaw.safeParse(x);
        if (!r.success || !r.data.id) return [];
        return [
          {
            id: r.data.id,
            name: r.data.name ?? null,
            createdAt: r.data.created_at,
            env: r.data.env,
            planNames: r.data.subscriptions
              .filter((s) => !s.add_on && s.status === "active")
              .map((s) => plans.get(s.plan_id)?.name ?? s.plan_id),
          },
        ];
      });
    return c.json({ items, nextCursor: e?.next_cursor ?? null });
  } catch {
    return fail(c, "autumn_unavailable", "Unable to load customers");
  }
});
app.get("/v1/orgs/:id/customers/:customerId", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  try {
    const key = await keyFor(c, row),
      payload = await autumn(c, key, "/v1/customers.get", {
        customer_id: c.req.param("customerId"),
        expand: ["invoices"],
      }),
      raw = CustomerRaw.safeParse(payload).success ? CustomerRaw.parse(payload) : null;
    if (!raw || !raw.id) return fail(c, "not_found", "Customer not found");
    const customerId = raw.id;
    const plans = await plansFor(c, row),
      names = new Map([[customerId, raw.name ?? ""]]),
      subs = raw.subscriptions.map((s) =>
        subView({ ...s, customer_id: customerId }, plans, names, "usd", now()),
      ),
      purchases = raw.purchases.map((p) =>
        purchaseView({ ...p, customer_id: customerId }, plans, names, "usd"),
      ),
      invoices = (raw.invoices ?? []).map((i) => invoiceView(i, plans, names)),
      value = new Map<string, number>();
    for (const i of invoices)
      if (i.netPaid)
        value.set(i.netPaid.currency, (value.get(i.netPaid.currency) ?? 0) + i.netPaid.amount);
    return c.json({
      customer: {
        id: raw.id,
        name: raw.name ?? null,
        createdAt: raw.created_at,
        env: raw.env,
        planNames: subs.filter((s) => s.status === "active" && !s.addOn).map((s) => s.planName),
        stripeId: raw.stripe_id ?? null,
        metadata: raw.metadata,
      },
      subscriptions: subs,
      purchases,
      invoices,
      lifetimeValue: [...value].map(([currency, amount]) => money(amount, currency)),
    });
  } catch {
    return fail(c, "autumn_unavailable", "Unable to load customer");
  }
});
app.get("/v1/settings/notifications", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM notification_settings WHERE user_id=?")
    .bind(c.get("user").id)
    .first();
  return c.json({ settings: settingsFromRow(row) });
});
app.put("/v1/settings/notifications", async (c) => {
  const body = parseBody(
    z.object({
      pushEnabled: z.boolean().optional(),
      purchases: z.boolean().optional(),
      subscriptions: z.boolean().optional(),
      trials: z.boolean().optional(),
      renewals: z.boolean().optional(),
      cancellations: z.boolean().optional(),
      excludeFree: z.boolean().optional(),
    }),
    await c.req.json().catch(() => null),
  );
  if (!body) return fail(c, "invalid_request", "Invalid request");
  const row = await c.env.DB.prepare("SELECT * FROM notification_settings WHERE user_id=?")
      .bind(c.get("user").id)
      .first(),
    settings = { ...settingsFromRow(row), ...body };
  await c.env.DB.prepare(
    "INSERT INTO notification_settings(user_id,push_enabled,purchases,subscriptions,trials,renewals,cancellations,exclude_free,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET push_enabled=excluded.push_enabled,purchases=excluded.purchases,subscriptions=excluded.subscriptions,trials=excluded.trials,renewals=excluded.renewals,cancellations=excluded.cancellations,exclude_free=excluded.exclude_free,updated_at=excluded.updated_at",
  )
    .bind(
      c.get("user").id,
      Number(settings.pushEnabled),
      Number(settings.purchases),
      Number(settings.subscriptions),
      Number(settings.trials),
      Number(settings.renewals),
      Number(settings.cancellations),
      Number(settings.excludeFree),
      now(),
    )
    .run();
  return c.json({ settings });
});
function settingsFromRow(row: Record<string, unknown> | null): NotificationSettings {
  return row
    ? {
        pushEnabled: Boolean(row.push_enabled),
        purchases: Boolean(row.purchases),
        subscriptions: Boolean(row.subscriptions),
        trials: Boolean(row.trials),
        renewals: Boolean(row.renewals),
        cancellations: Boolean(row.cancellations),
        excludeFree: Boolean(row.exclude_free),
      }
    : DEFAULT_NOTIFICATION_SETTINGS;
}
app.post("/v1/devices", async (c) => {
  const body = parseBody(
    z.object({
      expoPushToken: z.string().regex(/^(Exponent|Expo)PushToken\\[.+\\]$/),
      platform: z.enum(["ios", "android"]),
    }),
    await c.req.json().catch(() => null),
  );
  if (!body) return fail(c, "invalid_request", "Invalid request");
  await c.env.DB.prepare(
    "INSERT INTO devices(expo_push_token,user_id,platform,updated_at) VALUES(?,?,?,?) ON CONFLICT(expo_push_token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,updated_at=excluded.updated_at",
  )
    .bind(body.expoPushToken, c.get("user").id, body.platform, now())
    .run();
  return c.json({ ok: true });
});
app.delete("/v1/devices", async (c) => {
  const body = parseBody(
    z.object({ expoPushToken: z.string() }),
    await c.req.json().catch(() => null),
  );
  if (!body) return fail(c, "invalid_request", "Invalid request");
  await c.env.DB.prepare("DELETE FROM devices WHERE expo_push_token=? AND user_id=?")
    .bind(body.expoPushToken, c.get("user").id)
    .run();
  return c.json({ ok: true });
});
app.post("/v1/orgs/:id/test-push", async (c) => {
  const row = await getOrg(c, c.req.param("id"));
  if (!row) return fail(c, "not_found", "Organization not found");
  const devices = await c.env.DB.prepare("SELECT expo_push_token FROM devices WHERE user_id=?")
    .bind(c.get("user").id)
    .all();
  const messages = devices.results.map((d) => ({
    to: String(d.expo_push_token),
    title: `Test · ${String(row.name)}`,
    body: `Test notification · ${String(row.name)}`,
    data: {
      kind: "test",
      orgId: String(row.id),
      orgName: String(row.name),
      path: `/org/${row.id}`,
      title: `Test · ${row.name}`,
      body: `Test notification · ${row.name}`,
      amount: null,
    },
    sound: "cha_ching.wav",
    priority: "high",
  }));
  await sendPush(c, messages);
  return c.json({ sent: messages.length });
});
async function sendPush(c: any, messages: unknown[]): Promise<void> {
  if (!messages.length) return;
  const url = c.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";
  for (let i = 0; i < messages.length; i += 100) {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(c.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${c.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch(() => undefined);
  }
}
app.post("/webhooks/autumn/:webhookId", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM orgs WHERE webhook_id=?")
    .bind(c.req.param("webhookId"))
    .first();
  if (!row) return c.notFound();
  if (!row.webhook_secret_ciphertext || !row.webhook_secret_iv)
    return fail(c, "invalid_signature", "Webhook secret not configured");
  const body = await c.req.text(),
    id = c.req.header("svix-id"),
    timestamp = c.req.header("svix-timestamp"),
    signature = c.req.header("svix-signature");
  if (!id || !timestamp || !signature) return fail(c, "invalid_signature", "Missing signature");
  try {
    const key = await importEncryptionKey(c.env.KEY_ENCRYPTION_KEY),
      secret = await decryptSecret({
        ciphertext: String(row.webhook_secret_ciphertext),
        iv: String(row.webhook_secret_iv),
        key,
        aad: `${String(row.user_id)}:${String(row.id)}:webhook-secret`,
      });
    if (!(await verifySvix({ secret, id, timestamp, signature, body })))
      return fail(c, "invalid_signature", "Invalid signature");
    const duplicate = await c.env.DB.prepare(
      "SELECT 1 FROM webhook_events WHERE org_id=? AND event_id=?",
    )
      .bind(row.id, id)
      .first();
    if (duplicate) return c.json({ ok: true });
    await c.env.DB.prepare("INSERT INTO webhook_events(org_id,event_id,received_at) VALUES(?,?,?)")
      .bind(row.id, id, now())
      .run();
    await c.env.DB.prepare("UPDATE orgs SET last_webhook_at=? WHERE id=?")
      .bind(now(), row.id)
      .run();
    const parsed = z.object({ type: z.string(), data: z.unknown() }).safeParse(JSON.parse(body));
    if (!parsed.success) return c.json({ ok: true });
    if (parsed.data.type !== "billing.updated") return c.json({ ok: true });
    const eventData = z
      .object({
        customer_id: z.string(),
        plan_changes: z.array(
          z.object({
            action: z.string(),
            subscription: z
              .object({
                plan_id: z.string(),
                status: z.string(),
                canceled_at: z.number().nullable().optional(),
                trial_ends_at: z.number().nullable().optional(),
              })
              .optional(),
            purchase: z.object({ plan_id: z.string(), status: z.string() }).optional(),
          }),
        ),
        tags: z.array(z.string()).optional(),
      })
      .safeParse(parsed.data.data);
    if (!eventData.success) return c.json({ ok: true });
    const plans = await plansFor(c, row),
      planInfo = new Map<string, PlanInfo>(
        [...plans].map(([id, p]) => [
          id,
          { id, name: p.name, amount: p.price?.amount ?? null, currency: "usd", isFree: p.isFree },
        ]),
      ),
      settingsRow = await c.env.DB.prepare("SELECT * FROM notification_settings WHERE user_id=?")
        .bind(row.user_id)
        .first(),
      notifications = classifyEvent({
        event: { type: "billing.updated", data: eventData.data },
        plans: planInfo,
        settings: settingsFromRow(settingsRow),
        now: now(),
        orgName: String(row.name),
        orgId: String(row.id),
      });
    const devices = await c.env.DB.prepare("SELECT expo_push_token FROM devices WHERE user_id=?")
      .bind(row.user_id)
      .all();
    const messages = devices.results.flatMap((d) =>
      notifications.map((n) => ({
        to: String(d.expo_push_token),
        title: n.title,
        body: n.body,
        data: n,
        sound: "cha_ching.wav",
        priority: "high",
        channelId: `org-${row.id}`,
        threadId: `org-${row.id}`,
        interruptionLevel: "active",
      })),
    );
    c.executionCtx.waitUntil(sendPush(c, messages));
    return c.json({ ok: true });
  } catch {
    return fail(c, "invalid_signature", "Invalid signature");
  }
});
export default app;
