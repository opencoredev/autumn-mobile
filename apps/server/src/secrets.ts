import { decryptSecret, encryptSecret, importEncryptionKey } from "./crypto";

/**
 * Autumn keys and webhook signing secrets are AES-256-GCM encrypted with the
 * Worker's KEY_ENCRYPTION_KEY. The associated data binds each ciphertext to
 * its user, org and purpose, so a row copied elsewhere won't decrypt.
 */
export type SecretPurpose = "autumn-key" | "webhook-secret";

export const CURRENT_KEY_VERSION = 1;

let cachedKey: { raw: string; key: Promise<CryptoKey> } | null = null;

function masterKey(raw: string): Promise<CryptoKey> {
  if (cachedKey?.raw !== raw) cachedKey = { raw, key: importEncryptionKey(raw) };
  return cachedKey.key;
}

function aad(args: { userId: string; orgId: string; purpose: SecretPurpose }): string {
  return `${args.userId}:${args.orgId}:${args.purpose}`;
}

export async function sealSecret(args: {
  masterKey: string;
  userId: string;
  orgId: string;
  purpose: SecretPurpose;
  value: string;
}): Promise<{ ciphertext: string; iv: string }> {
  return encryptSecret({ value: args.value, key: await masterKey(args.masterKey), aad: aad(args) });
}

export async function openSecret(args: {
  masterKey: string;
  userId: string;
  orgId: string;
  purpose: SecretPurpose;
  ciphertext: string;
  iv: string;
}): Promise<string> {
  return decryptSecret({
    ciphertext: args.ciphertext,
    iv: args.iv,
    key: await masterKey(args.masterKey),
    aad: aad(args),
  });
}
