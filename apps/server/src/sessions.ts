import type { User } from "@autumn/shared";
import { randomToken, sha256 } from "./crypto";
import { userFromRow } from "./db";

export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Sessions are opaque random tokens. Only their SHA-256 hash is stored, so a
 * leaked database can't be replayed as live sessions.
 */
export async function issueSession(
  db: D1Database,
  args: { userId: string; now: number },
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken(32);
  const expiresAt = args.now + SESSION_TTL_MS;
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(await sha256(token), args.userId, args.now, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function userForToken(
  db: D1Database,
  args: { token: string; now: number },
): Promise<User | null> {
  const row = await db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(await sha256(args.token), args.now)
    .first();
  return userFromRow(row);
}

export async function revokeSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

export function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
