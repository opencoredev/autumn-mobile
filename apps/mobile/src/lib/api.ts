import { createApiClient } from "@autumn/shared";
import { config } from "../config";

let sessionToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export const api = createApiClient({
  baseUrl: config.apiUrl,
  getToken: () => sessionToken,
  onUnauthorized: () => unauthorizedHandler?.(),
});
