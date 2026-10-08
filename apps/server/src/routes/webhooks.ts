import { Hono, type Context } from "hono";
import type { OkResponse } from "@autumn/shared";
import { verifySvix } from "../crypto";
import {
  deleteDevices,
  deviceTokensForUser,
  findOrgByWebhookId,
  settingsForUser,
  type OrgRow,
} from "../db";
import { DEFAULT_EXPO_PUSH_URL, type AppEnv } from "../env";
import { HttpError, param } from "../http";
import { classifyEvent, renewalPlanIds, WebhookEvent } from "../notifications";
import { autumnFor, cachedNames, cachedPlans, orgCurrency } from "../org-context";
import { buildMessages, sendExpoPush } from "../push";
import { openSecret } from "../secrets";

export const webhookRoutes = new Hono<AppEnv>();

const ok = (c: Context<AppEnv>) => {
  const body: OkResponse = { ok: true };
  return c.json(body);
};

async function customerNameFor(args: {
  names: ReadonlyMap<string, string>;
  customerId: string;
  lookup: () => Promise<string | null>;
}): Promise<string | null> {
  return args.names.get(args.customerId) ?? (await args.lookup().catch(() => null));
}

/** Builds and sends the pushes for one verified event. Throws on Autumn failures. */
async function deliver(c: Context<AppEnv>, org: OrgRow, event: WebhookEvent): Promise<void> {
  const scope = { env: c.env, deps: c.var.deps };
  const settings = await settingsForUser(c.env.DB, org.user_id);
  if (!settings.pushEnabled) return;

  const client = await autumnFor(scope, org);
  const [plans, names, currency] = await Promise.all([
    cachedPlans(scope, org, client),
    cachedNames(scope, org, client),
    orgCurrency(scope, org),
  ]);
  const now = c.var.deps.now();
  const customerId =
    event.type === "billing.updated" ? event.data.customer_id : event.data.customer_id;

  // Renewal vs first invoice: compare the invoice time with when the
  // customer's subscription to that plan started.
  const subscriptionStartedAt = new Map<string, number>();
  if (event.type === "invoice.finalized" && customerId) {
    for (const planId of renewalPlanIds(event, plans)) {
      const page = await client.listSubscriptions({
        customerId,
        planId,
        statuses: ["active", "past_due", "expired"],
        limit: 20,
      });
      const started = page.items
        .map((sub) => sub.started_at)
        .filter((startedAt) => startedAt <= event.data.created_at)
        .sort((a, b) => b - a)[0];
      if (started !== undefined) subscriptionStartedAt.set(planId, started);
    }
  }

  const customerName = customerId
    ? await customerNameFor({
        names,
        customerId,
        lookup: async () => (await client.getCustomer(customerId)).name,
      })
    : null;

  const notifications = classifyEvent({
    event,
    org: { id: org.id, name: org.name },
    plans,
    currency,
    settings,
    now,
    customerName,
    subscriptionStartedAt,
  });
  if (notifications.length === 0) return;

  const tokens = await deviceTokensForUser(c.env.DB, org.user_id);
  const messages = buildMessages({ tokens, notifications });
  const send = sendExpoPush({
    messages,
    url: c.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL,
    accessToken: c.env.EXPO_ACCESS_TOKEN,
    fetch: c.var.deps.fetch,
  }).then((result) => deleteDevices(c.env.DB, result.unregistered));
  c.executionCtx.waitUntil(send);
}

/**
 * Autumn → Worker. Verifies the Svix signature with the org's signing secret,
 * drops replays by svix-id, then pushes to the org owner's devices.
 */
webhookRoutes.post("/autumn/:webhookId", async (c) => {
  const org = await findOrgByWebhookId(c.env.DB, param(c, "webhookId"));
  if (!org) throw new HttpError("not_found", "Unknown webhook.");
  if (!org.webhook_secret_ciphertext || !org.webhook_secret_iv) {
    throw new HttpError("invalid_signature", "No signing secret saved for this webhook yet.");
  }

  const id = c.req.header("svix-id");
  const timestamp = c.req.header("svix-timestamp");
  const signature = c.req.header("svix-signature");
  if (!id || !timestamp || !signature)
    throw new HttpError("invalid_signature", "Missing Svix headers.");

  const rawBody = await c.req.text();
  const secret = await openSecret({
    masterKey: c.env.KEY_ENCRYPTION_KEY,
    userId: org.user_id,
    orgId: org.id,
    purpose: "webhook-secret",
    ciphertext: org.webhook_secret_ciphertext,
    iv: org.webhook_secret_iv,
  });
  const valid = await verifySvix({
    secret,
    id,
    timestamp,
    signature,
    body: rawBody,
    now: c.var.deps.now(),
  });
  if (!valid) throw new HttpError("invalid_signature", "Signature didn't match.");

  const now = c.var.deps.now();
  const claimed = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO webhook_events (org_id, event_id, received_at) VALUES (?, ?, ?)",
  )
    .bind(org.id, id, now)
    .run();
  if (claimed.meta.changes === 0) return ok(c);
  await c.env.DB.prepare("UPDATE orgs SET last_webhook_at = ? WHERE id = ?")
    .bind(now, org.id)
    .run();

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return ok(c);
  }
  const event = WebhookEvent.safeParse(json);
  // Other event types (balances.*, auto top-ups) are acknowledged and ignored.
  if (!event.success) return ok(c);

  try {
    await deliver(c, org, event.data);
  } catch (error) {
    // Release the claim so Svix's retry can deliver it.
    await c.env.DB.prepare("DELETE FROM webhook_events WHERE org_id = ? AND event_id = ?")
      .bind(org.id, id)
      .run();
    throw error;
  }
  return ok(c);
});
