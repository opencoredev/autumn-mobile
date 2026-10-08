import type { GoogleResult } from "./google-sign-in";

export type { GoogleResult };

// Native Google sign-in has no web build. Web is a dev surface only.
export const googleSignInAvailable = false;

export async function signInWithGoogle(): Promise<GoogleResult> {
  return { kind: "error", message: "Google sign-in runs on iOS and Android." };
}

export async function signOutOfGoogle(): Promise<void> {}
