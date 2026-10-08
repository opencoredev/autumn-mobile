// Bindings declared in wrangler.jsonc plus secrets set with `wrangler secret put`.
interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  /** Base URL for Autumn's API. Points at scripts/mock-autumn.ts in local dev. */
  AUTUMN_API_BASE: string;
  /** Public origin used to build webhook URLs. Falls back to the request origin. */
  PUBLIC_BASE_URL: string;
  /** Comma-separated Google OAuth client IDs accepted as ID token audiences. */
  GOOGLE_CLIENT_IDS: string;
  /** Comma-separated iOS bundle IDs accepted as Apple identity token audiences. */
  APPLE_AUDIENCES: string;
  /** Secret: base64 of 32 random bytes. Encrypts Autumn keys and webhook secrets. */
  KEY_ENCRYPTION_KEY: string;
  /** Secret (optional): Expo access token when enhanced push security is on. */
  EXPO_ACCESS_TOKEN?: string;
  /** Local dev only, via .dev.vars: enables POST /v1/auth/dev. */
  ALLOW_DEV_LOGIN?: string;
  /** Local dev only: overrides Expo's push endpoint so pushes go to the mock. */
  EXPO_PUSH_URL?: string;
}
