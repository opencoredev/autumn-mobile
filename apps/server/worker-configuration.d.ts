interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  AUTUMN_API_BASE: string;
  PUBLIC_BASE_URL: string;
  GOOGLE_CLIENT_IDS: string;
  APPLE_AUDIENCES: string;
  KEY_ENCRYPTION_KEY: string;
  EXPO_ACCESS_TOKEN?: string;
  ALLOW_DEV_LOGIN?: string;
  EXPO_PUSH_URL?: string;
}
