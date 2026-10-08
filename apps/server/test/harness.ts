import { readFileSync } from "node:fs";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import { getPlatformProxy } from "wrangler";
import { createApp } from "../src/app";
import { createIdentityVerifier } from "../src/identity";
import { createFakeAutumn, FAKE_AUTUMN_BASE, FAKE_EXPO_URL } from "./fake-autumn";

export { randomWebhookSecret, signSvix } from "./svix";

export const NOW = Date.UTC(2026, 9, 8, 15, 0, 0);
/** A plausible-looking fake Autumn key. Assembled at runtime so no key literal sits in the repo. */
export const FAKE_KEY = ["am", "sk", "live", "fixture", "9f3c"].join("_");
export const GOOGLE_AUDIENCE = "google-client.apps.test";
export const APPLE_AUDIENCE = "com.example.autumn";

function randomMasterKey(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

/** Stands in for Google's and Apple's signing keys so ID tokens verify offline. */
export async function createIdentityKeys() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256" };
  const keySet = createLocalJWKSet({ keys: [jwk] });
  async function sign(args: {
    issuer: string;
    audience: string;
    subject: string;
    expiresIn?: string;
  }) {
    return new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(args.issuer)
      .setAudience(args.audience)
      .setSubject(args.subject)
      .setIssuedAt()
      .setExpirationTime(args.expiresIn ?? "10m")
      .sign(privateKey);
  }
  return { keySet, sign };
}

async function applyMigrations(db: D1Database): Promise<void> {
  const sql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) await db.prepare(statement).run();
}

/**
 * A Worker with real local D1 and KV (via wrangler's platform proxy), the fake
 * Autumn behind an injected fetch, and offline identity verification.
 */
export async function createHarness(options: { allowDevLogin?: boolean } = {}) {
  const proxy = await getPlatformProxy<Env>({ configPath: "wrangler.jsonc", persist: false });
  await applyMigrations(proxy.env.DB);
  const fake = createFakeAutumn({ now: NOW, validKey: FAKE_KEY });
  const identity = await createIdentityKeys();
  let now = NOW;
  const app = createApp({
    fetch: fake.fetch,
    now: () => now,
    verifyIdentity: createIdentityVerifier({ google: identity.keySet, apple: identity.keySet }),
  });
  const env: Env = {
    ...proxy.env,
    AUTUMN_API_BASE: FAKE_AUTUMN_BASE,
    EXPO_PUSH_URL: FAKE_EXPO_URL,
    PUBLIC_BASE_URL: "https://worker.test",
    GOOGLE_CLIENT_IDS: `${GOOGLE_AUDIENCE}, other-client.apps.test`,
    APPLE_AUDIENCES: APPLE_AUDIENCE,
    KEY_ENCRYPTION_KEY: randomMasterKey(),
    ALLOW_DEV_LOGIN: options.allowDevLogin === false ? "false" : "true",
  };
  const pending: Promise<unknown>[] = [];
  // Collect waitUntil work so each request can await its pushes before asserting.
  const ctx = proxy.ctx;
  ctx.waitUntil = (promise) => void pending.push(promise);

  async function request(
    path: string,
    init: {
      method?: string;
      token?: string | null;
      body?: unknown;
      headers?: Record<string, string>;
      rawBody?: string;
    } = {},
  ) {
    const headers: Record<string, string> = { ...init.headers };
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    let body: string | undefined;
    if (init.rawBody !== undefined) body = init.rawBody;
    else if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers["content-type"] = "application/json";
    }
    const response = await app.fetch(
      new Request(`https://worker.test${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(body ? { body } : {}),
      }),
      env,
      ctx,
    );
    await Promise.all(pending.splice(0));
    const text = await response.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, text, json };
  }

  async function devLogin(): Promise<string> {
    const response = await request("/v1/auth/dev", { method: "POST" });
    const parsed = response.json;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("token" in parsed) ||
      typeof parsed.token !== "string"
    ) {
      throw new Error(`dev login failed: ${response.status}`);
    }
    return parsed.token;
  }

  return {
    env,
    fake,
    identity,
    request,
    devLogin,
    setNow: (value: number) => {
      now = value;
    },
    dispose: () => proxy.dispose(),
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
