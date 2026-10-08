import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthProvider } from "@autumn/shared";

/** Verifies a provider ID token and returns its subject, or null when invalid. */
export type IdentityVerifier = (args: {
  provider: AuthProvider;
  token: string;
  audiences: readonly string[];
}) => Promise<{ subject: string } | null>;

const ISSUERS: Record<AuthProvider, string[]> = {
  google: ["accounts.google.com", "https://accounts.google.com"],
  apple: ["https://appleid.apple.com"],
};

const JWKS_URLS: Record<AuthProvider, string> = {
  google: "https://www.googleapis.com/oauth2/v3/certs",
  apple: "https://appleid.apple.com/auth/keys",
};

/**
 * Builds a verifier from key sets per provider. Production passes remote JWKS;
 * tests pass a local key set so no network is involved.
 */
export function createIdentityVerifier(
  keys: Record<AuthProvider, JWTVerifyGetKey>,
): IdentityVerifier {
  return async ({ provider, token, audiences }) => {
    if (audiences.length === 0) return null;
    try {
      const { payload } = await jwtVerify(token, keys[provider], {
        issuer: ISSUERS[provider],
        audience: [...audiences],
        algorithms: ["RS256", "ES256"],
      });
      return typeof payload.sub === "string" && payload.sub.length > 0
        ? { subject: payload.sub }
        : null;
    } catch {
      return null;
    }
  };
}

let remoteVerifier: IdentityVerifier | null = null;

export function remoteIdentityVerifier(): IdentityVerifier {
  remoteVerifier ??= createIdentityVerifier({
    google: createRemoteJWKSet(new URL(JWKS_URLS.google)),
    apple: createRemoteJWKSet(new URL(JWKS_URLS.apple)),
  });
  return remoteVerifier;
}
