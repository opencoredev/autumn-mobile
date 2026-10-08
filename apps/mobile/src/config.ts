/**
 * Public build-time configuration. Values come from `EXPO_PUBLIC_*` env vars
 * (see `.env.example`). None of these are secrets.
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "",
  /** Shows the dev sign-in button. Only works against a Worker with ALLOW_DEV_LOGIN. */
  devLogin: process.env.EXPO_PUBLIC_DEV_LOGIN === "true",
} as const;
