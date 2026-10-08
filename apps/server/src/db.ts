import { z } from "zod";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type Org,
  type OrgId,
  type User,
  UserSchema,
  OrgIdSchema,
} from "@autumn/shared";

/** D1 row shapes, parsed on read so the rest of the Worker can trust them. */

export const OrgRow = z.object({
  id: OrgIdSchema,
  user_id: z.string(),
  name: z.string(),
  key_ciphertext: z.string(),
  key_iv: z.string(),
  key_version: z.number(),
  key_suffix: z.string(),
  key_env: z.enum(["live", "sandbox"]),
  webhook_id: z.string(),
  webhook_secret_ciphertext: z.string().nullable(),
  webhook_secret_iv: z.string().nullable(),
  last_webhook_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});
export type OrgRow = z.infer<typeof OrgRow>;

const UserRow = z.object({
  id: z.string(),
  provider: z.enum(["google", "apple"]),
  display_name: z.string().nullable(),
  created_at: z.number(),
});

const SettingsRow = z.object({
  push_enabled: z.number(),
  purchases: z.number(),
  subscriptions: z.number(),
  trials: z.number(),
  renewals: z.number(),
  cancellations: z.number(),
  exclude_free: z.number(),
});

function parseRow<S extends z.ZodType>(schema: S, row: unknown): z.infer<S> | null {
  if (row === null || row === undefined) return null;
  return schema.parse(row);
}

export function userFromRow(row: unknown): User | null {
  const parsed = parseRow(UserRow, row);
  if (!parsed) return null;
  return UserSchema.parse({
    id: parsed.id,
    provider: parsed.provider,
    displayName: parsed.display_name,
    createdAt: parsed.created_at,
  });
}

export function orgView(row: OrgRow, baseUrl: string): Org {
  return {
    id: row.id,
    name: row.name,
    keySuffix: row.key_suffix,
    keyEnv: row.key_env,
    webhookUrl: `${baseUrl.replace(/\/$/, "")}/webhooks/autumn/${row.webhook_id}`,
    hasWebhookSecret: row.webhook_secret_ciphertext !== null,
    lastWebhookAt: row.last_webhook_at,
    createdAt: row.created_at,
  };
}

export async function findOrgForUser(db: D1Database, args: { orgId: string; userId: string }) {
  const row = await db
    .prepare("SELECT * FROM orgs WHERE id = ? AND user_id = ?")
    .bind(args.orgId, args.userId)
    .first();
  return parseRow(OrgRow, row);
}

export async function findOrgByWebhookId(db: D1Database, webhookId: string) {
  return parseRow(
    OrgRow,
    await db.prepare("SELECT * FROM orgs WHERE webhook_id = ?").bind(webhookId).first(),
  );
}

export async function listOrgsForUser(db: D1Database, userId: string): Promise<OrgRow[]> {
  const result = await db
    .prepare("SELECT * FROM orgs WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all();
  return result.results.map((row) => OrgRow.parse(row));
}

export async function settingsForUser(
  db: D1Database,
  userId: string,
): Promise<NotificationSettings> {
  const row = parseRow(
    SettingsRow,
    await db.prepare("SELECT * FROM notification_settings WHERE user_id = ?").bind(userId).first(),
  );
  if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  return {
    pushEnabled: row.push_enabled === 1,
    purchases: row.purchases === 1,
    subscriptions: row.subscriptions === 1,
    trials: row.trials === 1,
    renewals: row.renewals === 1,
    cancellations: row.cancellations === 1,
    excludeFree: row.exclude_free === 1,
  };
}

export async function saveSettings(
  db: D1Database,
  args: { userId: string; settings: NotificationSettings; now: number },
): Promise<void> {
  const s = args.settings;
  await db
    .prepare(
      `INSERT INTO notification_settings
         (user_id, push_enabled, purchases, subscriptions, trials, renewals, cancellations, exclude_free, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         push_enabled = excluded.push_enabled, purchases = excluded.purchases,
         subscriptions = excluded.subscriptions, trials = excluded.trials,
         renewals = excluded.renewals, cancellations = excluded.cancellations,
         exclude_free = excluded.exclude_free, updated_at = excluded.updated_at`,
    )
    .bind(
      args.userId,
      Number(s.pushEnabled),
      Number(s.purchases),
      Number(s.subscriptions),
      Number(s.trials),
      Number(s.renewals),
      Number(s.cancellations),
      Number(s.excludeFree),
      args.now,
    )
    .run();
}

export async function deviceTokensForUser(db: D1Database, userId: string): Promise<string[]> {
  const result = await db
    .prepare("SELECT expo_push_token FROM devices WHERE user_id = ?")
    .bind(userId)
    .all();
  return result.results.map(
    (row) => z.object({ expo_push_token: z.string() }).parse(row).expo_push_token,
  );
}

export async function deleteDevices(db: D1Database, tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.batch(
    tokens.map((token) => db.prepare("DELETE FROM devices WHERE expo_push_token = ?").bind(token)),
  );
}

export function isOrgId(value: string): value is OrgId {
  return OrgIdSchema.safeParse(value).success;
}
