import { Hono, type Context } from "hono";
import {
  AppleSignInRequestSchema,
  GoogleSignInRequestSchema,
  type AuthProvider,
  type OkResponse,
  type SessionResponse,
} from "@autumn/shared";
import { randomToken } from "../crypto";
import { userFromRow } from "../db";
import { csv, type AppEnv } from "../env";
import { HttpError, readJson } from "../http";
import { bearerToken, issueSession, revokeSession } from "../sessions";

export const authRoutes = new Hono<AppEnv>();

const DEV_SUBJECT = "dev-user";

async function upsertUser(
  db: D1Database,
  args: { provider: AuthProvider; subject: string; displayName: string | null; now: number },
): Promise<string> {
  const existing = await db
    .prepare("SELECT id, display_name FROM users WHERE provider = ? AND provider_subject = ?")
    .bind(args.provider, args.subject)
    .first<{ id: string; display_name: string | null }>();
  if (existing) {
    // Apple sends the name only on the first sign-in; keep it once we have it.
    if (args.displayName && !existing.display_name) {
      await db
        .prepare("UPDATE users SET display_name = ? WHERE id = ?")
        .bind(args.displayName, existing.id)
        .run();
    }
    return existing.id;
  }
  const id = randomToken(16);
  await db
    .prepare(
      "INSERT INTO users (id, provider, provider_subject, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, args.provider, args.subject, args.displayName, args.now)
    .run();
  return id;
}

async function sessionFor(c: Context<AppEnv>, userId: string): Promise<Response> {
  const now = c.var.deps.now();
  const user = userFromRow(
    await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first(),
  );
  if (!user) throw new HttpError("internal", "User record missing.");
  const session = await issueSession(c.env.DB, { userId, now });
  const body: SessionResponse = { ...session, user };
  return c.json(body);
}

async function signIn(
  c: Context<AppEnv>,
  args: { provider: AuthProvider; token: string; displayName: string | null },
): Promise<Response> {
  const audiences = csv(
    args.provider === "google" ? c.env.GOOGLE_CLIENT_IDS : c.env.APPLE_AUDIENCES,
  );
  const identity = await c.var.deps.verifyIdentity({
    provider: args.provider,
    token: args.token,
    audiences,
  });
  if (!identity) throw new HttpError("unauthorized", "Sign-in token was rejected.");
  const userId = await upsertUser(c.env.DB, {
    provider: args.provider,
    subject: identity.subject,
    displayName: args.displayName,
    now: c.var.deps.now(),
  });
  return sessionFor(c, userId);
}

authRoutes.post("/google", async (c) => {
  const body = await readJson(c, GoogleSignInRequestSchema);
  return signIn(c, { provider: "google", token: body.idToken, displayName: null });
});

authRoutes.post("/apple", async (c) => {
  const body = await readJson(c, AppleSignInRequestSchema);
  return signIn(c, { provider: "apple", token: body.identityToken, displayName: body.displayName });
});

/** Local development only. 404 unless ALLOW_DEV_LOGIN is "true" (set in .dev.vars). */
authRoutes.post("/dev", async (c) => {
  if (c.env.ALLOW_DEV_LOGIN !== "true") throw new HttpError("not_found", "Not found.");
  const userId = await upsertUser(c.env.DB, {
    provider: "google",
    subject: DEV_SUBJECT,
    displayName: "Dev User",
    now: c.var.deps.now(),
  });
  return sessionFor(c, userId);
});

authRoutes.post("/logout", async (c) => {
  const token = bearerToken(c.req.header("authorization"));
  if (token) await revokeSession(c.env.DB, token);
  const body: OkResponse = { ok: true };
  return c.json(body);
});
