import type { AppleResult } from "./apple-sign-in";

export type { AppleResult };

export async function isAppleSignInAvailable(): Promise<boolean> {
  return false;
}

export async function signInWithApple(): Promise<AppleResult> {
  return { kind: "error", message: "Sign in with Apple runs on iOS." };
}
