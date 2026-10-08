/** Worker bindings and small, boundary-only configuration helpers. */
export type WorkerEnv = Env;
export function keyEnvironment(key: string): "live" | "sandbox" {
  return key.includes("am_sk_test_") ? "sandbox" : "live";
}
