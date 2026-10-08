import { Hono } from "hono";
import {
  RegisterDeviceRequestSchema,
  UnregisterDeviceRequestSchema,
  UpdateNotificationSettingsRequestSchema,
  type MeResponse,
  type NotificationSettings,
  type NotificationSettingsResponse,
  type OkResponse,
} from "@autumn/shared";
import { saveSettings, settingsForUser } from "../db";
import type { AppEnv } from "../env";
import { readJson } from "../http";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.get("/me", (c) => {
  const body: MeResponse = { user: c.var.user };
  return c.json(body);
});

accountRoutes.get("/settings/notifications", async (c) => {
  const body: NotificationSettingsResponse = {
    settings: await settingsForUser(c.env.DB, c.var.user.id),
  };
  return c.json(body);
});

accountRoutes.put("/settings/notifications", async (c) => {
  const patch = await readJson(c, UpdateNotificationSettingsRequestSchema);
  const current = await settingsForUser(c.env.DB, c.var.user.id);
  const settings: NotificationSettings = {
    pushEnabled: patch.pushEnabled ?? current.pushEnabled,
    purchases: patch.purchases ?? current.purchases,
    subscriptions: patch.subscriptions ?? current.subscriptions,
    trials: patch.trials ?? current.trials,
    renewals: patch.renewals ?? current.renewals,
    cancellations: patch.cancellations ?? current.cancellations,
    excludeFree: patch.excludeFree ?? current.excludeFree,
  };
  await saveSettings(c.env.DB, { userId: c.var.user.id, settings, now: c.var.deps.now() });
  const body: NotificationSettingsResponse = { settings };
  return c.json(body);
});

accountRoutes.post("/devices", async (c) => {
  const device = await readJson(c, RegisterDeviceRequestSchema);
  // A token belongs to one install; if another account registered it, it moves here.
  await c.env.DB.prepare(
    `INSERT INTO devices (expo_push_token, user_id, platform, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(expo_push_token) DO UPDATE SET
       user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at`,
  )
    .bind(device.expoPushToken, c.var.user.id, device.platform, c.var.deps.now())
    .run();
  const body: OkResponse = { ok: true };
  return c.json(body);
});

accountRoutes.delete("/devices", async (c) => {
  const device = await readJson(c, UnregisterDeviceRequestSchema);
  await c.env.DB.prepare("DELETE FROM devices WHERE expo_push_token = ? AND user_id = ?")
    .bind(device.expoPushToken, c.var.user.id)
    .run();
  const body: OkResponse = { ok: true };
  return c.json(body);
});
