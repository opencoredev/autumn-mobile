import { Hono, type Context } from "hono";
import {
  CreateOrgRequestSchema,
  RenameOrgRequestSchema,
  ReplaceKeyRequestSchema,
  SetWebhookSecretRequestSchema,
  type OkResponse,
  type OrgListResponse,
  type OrgResponse,
  type PushData,
  type TestPushResponse,
} from "@autumn/shared";
import { createAutumnClient } from "../autumn/client";
import { randomToken } from "../crypto";
import {
  deleteDevices,
  deviceTokensForUser,
  findOrgForUser,
  listOrgsForUser,
  orgView,
  type OrgRow,
} from "../db";
import { DEFAULT_AUTUMN_BASE, DEFAULT_EXPO_PUSH_URL, keyEnvironment, type AppEnv } from "../env";
import { HttpError, param, readJson } from "../http";
import { clearOrgCache } from "../org-context";
import { buildMessages, sendExpoPush } from "../push";
import { CURRENT_KEY_VERSION, sealSecret } from "../secrets";

export const orgRoutes = new Hono<AppEnv>();

export function publicBaseUrl(c: Context<AppEnv>): string {
  return c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
}

export async function requireOrg(c: Context<AppEnv>): Promise<OrgRow> {
  const org = await findOrgForUser(c.env.DB, { orgId: param(c, "orgId"), userId: c.var.user.id });
  if (!org) throw new HttpError("not_found", "Organization not found.");
  return org;
}

async function respondWithOrg(c: Context<AppEnv>, orgId: string): Promise<Response> {
  const org = await findOrgForUser(c.env.DB, { orgId, userId: c.var.user.id });
  if (!org) throw new HttpError("not_found", "Organization not found.");
  const body: OrgResponse = { org: orgView(org, publicBaseUrl(c)) };
  return c.json(body);
}

/** Proves the key works with a read-only call before anything is stored. */
async function validateKey(c: Context<AppEnv>, secretKey: string): Promise<void> {
  const client = createAutumnClient({
    baseUrl: c.env.AUTUMN_API_BASE || DEFAULT_AUTUMN_BASE,
    secretKey,
    fetch: c.var.deps.fetch,
  });
  await client.listPlans();
}

orgRoutes.get("/", async (c) => {
  const orgs = await listOrgsForUser(c.env.DB, c.var.user.id);
  const body: OrgListResponse = { orgs: orgs.map((org) => orgView(org, publicBaseUrl(c))) };
  return c.json(body);
});

orgRoutes.post("/", async (c) => {
  const input = await readJson(c, CreateOrgRequestSchema);
  await validateKey(c, input.secretKey);
  const userId = c.var.user.id;
  const orgId = randomToken(16);
  const now = c.var.deps.now();
  const sealed = await sealSecret({
    masterKey: c.env.KEY_ENCRYPTION_KEY,
    userId,
    orgId,
    purpose: "autumn-key",
    value: input.secretKey,
  });
  await c.env.DB.prepare(
    `INSERT INTO orgs (id, user_id, name, key_ciphertext, key_iv, key_version, key_suffix, key_env,
                       webhook_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      orgId,
      userId,
      input.name,
      sealed.ciphertext,
      sealed.iv,
      CURRENT_KEY_VERSION,
      input.secretKey.slice(-4),
      keyEnvironment(input.secretKey),
      randomToken(24),
      now,
      now,
    )
    .run();
  return respondWithOrg(c, orgId);
});

orgRoutes.patch("/:orgId", async (c) => {
  const org = await requireOrg(c);
  const input = await readJson(c, RenameOrgRequestSchema);
  await c.env.DB.prepare("UPDATE orgs SET name = ?, updated_at = ? WHERE id = ?")
    .bind(input.name, c.var.deps.now(), org.id)
    .run();
  return respondWithOrg(c, org.id);
});

orgRoutes.put("/:orgId/key", async (c) => {
  const org = await requireOrg(c);
  const input = await readJson(c, ReplaceKeyRequestSchema);
  await validateKey(c, input.secretKey);
  const sealed = await sealSecret({
    masterKey: c.env.KEY_ENCRYPTION_KEY,
    userId: org.user_id,
    orgId: org.id,
    purpose: "autumn-key",
    value: input.secretKey,
  });
  await c.env.DB.prepare(
    `UPDATE orgs SET key_ciphertext = ?, key_iv = ?, key_version = ?, key_suffix = ?, key_env = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      sealed.ciphertext,
      sealed.iv,
      CURRENT_KEY_VERSION,
      input.secretKey.slice(-4),
      keyEnvironment(input.secretKey),
      c.var.deps.now(),
      org.id,
    )
    .run();
  await clearOrgCache(c.env, org.id);
  return respondWithOrg(c, org.id);
});

orgRoutes.put("/:orgId/webhook-secret", async (c) => {
  const org = await requireOrg(c);
  const input = await readJson(c, SetWebhookSecretRequestSchema);
  const sealed = await sealSecret({
    masterKey: c.env.KEY_ENCRYPTION_KEY,
    userId: org.user_id,
    orgId: org.id,
    purpose: "webhook-secret",
    value: input.signingSecret,
  });
  await c.env.DB.prepare(
    "UPDATE orgs SET webhook_secret_ciphertext = ?, webhook_secret_iv = ?, updated_at = ? WHERE id = ?",
  )
    .bind(sealed.ciphertext, sealed.iv, c.var.deps.now(), org.id)
    .run();
  return respondWithOrg(c, org.id);
});

orgRoutes.delete("/:orgId", async (c) => {
  const org = await requireOrg(c);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM orgs WHERE id = ?").bind(org.id),
    c.env.DB.prepare("DELETE FROM webhook_events WHERE org_id = ?").bind(org.id),
  ]);
  await clearOrgCache(c.env, org.id);
  const body: OkResponse = { ok: true };
  return c.json(body);
});

orgRoutes.post("/:orgId/test-push", async (c) => {
  const org = await requireOrg(c);
  const tokens = await deviceTokensForUser(c.env.DB, c.var.user.id);
  const data: PushData = {
    kind: "test",
    orgId: org.id,
    orgName: org.name,
    path: "/",
    title: "Cha-ching! Notifications work",
    body: `Test alert · ${org.name}`,
    amount: null,
  };
  const result = await sendExpoPush({
    messages: buildMessages({ tokens, notifications: [data] }),
    url: c.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL,
    accessToken: c.env.EXPO_ACCESS_TOKEN,
    fetch: c.var.deps.fetch,
  });
  await deleteDevices(c.env.DB, result.unregistered);
  const body: TestPushResponse = { sent: result.sent };
  return c.json(body);
});
