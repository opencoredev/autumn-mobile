import { Hono, type Context } from "hono";
import {
  AppleSignInRequestSchema,
  GoogleSignInRequestSchema,
  type AuthProvider,
  type OkResponse,
  type SessionResponse,
} from "@autumn/shared";
import { emailLinkHash, randomToken } from "../crypto";
import { userFromRow } from "../db";
import { csv, type AppEnv } from "../env";
import { HttpError, readJson } from "../http";
import { bearerToken, issueSession, revokeSession } from "../sessions";

export const authRoutes = new Hono<AppEnv>();

const DEV_SUBJECT = "dev-user";

/**
 * Finds the user for a provider identity, creating one if needed. A new
 * identity whose provider-verified email matches an existing identity (same
 * keyed hash) joins that user, so Google and Apple sign-ins with the same
 * email share one account. Apple "Hide My Email" relays never match.
 */
async function resolveUser(
  db: D1Database,
  args: {
    provider: AuthProvider;
    subject: string;
    emailHash: string | null;
    displayName: string | null;
    now: number;
  },
): Promise<string> {
  const known = await db
    .prepare(
      "SELECT user_id, email_hash FROM identities WHERE provider = ? AND provider_subject = ?",
    )
    .bind(args.provider, args.subject)
    .first<{ user_id: string; email_hash: string | null }>();

  let userId: string;
  if (known) {
    userId = known.user_id;
    if (args.emailHash && known.email_hash !== args.emailHash) {
      await db
        .prepare("UPDATE identities SET email_hash = ? WHERE provider = ? AND provider_subject = ?")
        .bind(args.emailHash, args.provider, args.subject)
        .run();
    }
  } else {
    const match = args.emailHash
      ? await db
          .prepare(
            "SELECT user_id FROM identities WHERE email_hash = ? ORDER BY created_at ASC LIMIT 1",
          )
          .bind(args.emailHash)
          .first<{ user_id: string }>()
      : null;
    userId = match?.user_id ?? randomToken(16);
    const statements = [
      db
        .prepare(
          "INSERT INTO identities (provider, provider_subject, user_id, email_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(args.provider, args.subject, userId, args.emailHash, args.now),
    ];
    if (!match) {
      statements.push(
        db
          .prepare(
            "INSERT INTO users (id, provider, provider_subject, display_name, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(userId, args.provider, args.subject, args.displayName, args.now),
      );
    }
    await db.batch(statements);
  }

  // Apple sends the name only on the first sign-in; keep it once we have one.
  if (args.displayName) {
    await db
      .prepare("UPDATE users SET display_name = ? WHERE id = ? AND display_name IS NULL")
      .bind(args.displayName, userId)
      .run();
  }
  return userId;
}

async function sessionFor(
  c: Context<AppEnv>,
  args: { userId: string; provider: AuthProvider },
): Promise<Response> {
  const now = c.var.deps.now();
  const user = userFromRow(
    await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(args.userId).first(),
  );
  if (!user) throw new HttpError("internal", "User record missing.");
  const session = await issueSession(c.env.DB, {
    userId: args.userId,
    provider: args.provider,
    now,
  });
  const body: SessionResponse = { ...session, user: { ...user, provider: args.provider } };
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
  // The email is used only to compute this hash and is then discarded.
  const emailHash = identity.email
    ? await emailLinkHash({ masterKey: c.env.KEY_ENCRYPTION_KEY, email: identity.email })
    : null;
  const userId = await resolveUser(c.env.DB, {
    provider: args.provider,
    subject: identity.subject,
    emailHash,
    displayName: args.displayName,
    now: c.var.deps.now(),
  });
  return sessionFor(c, { userId, provider: args.provider });
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
  const userId = await resolveUser(c.env.DB, {
    provider: "google",
    subject: DEV_SUBJECT,
    emailHash: null,
    displayName: "Dev User",
    now: c.var.deps.now(),
  });
  return sessionFor(c, { userId, provider: "google" });
});

authRoutes.post("/logout", async (c) => {
  const token = bearerToken(c.req.header("authorization"));
  if (token) await revokeSession(c.env.DB, token);
  const body: OkResponse = { ok: true };
  return c.json(body);
});
