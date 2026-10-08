import type { User } from "@autumn/shared";
import type { IdentityVerifier } from "./identity";

/** Things tests swap out. Production uses the defaults from `defaultDeps`. */
export type Deps = {
  readonly fetch: typeof fetch;
  readonly verifyIdentity: IdentityVerifier;
  readonly now: () => number;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; deps: Deps };
};

export const DEFAULT_AUTUMN_BASE = "https://api.useautumn.com";
export const DEFAULT_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function csv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function keyEnvironment(secretKey: string): "live" | "sandbox" {
  return secretKey.startsWith("am_sk_test_") ? "sandbox" : "live";
}
