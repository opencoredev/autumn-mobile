const encoder = new TextEncoder();
function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(value: string): Uint8Array {
  const s = atob(value);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
export async function importEncryptionKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytesBuffer(unb64(value)), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptSecret(args: {
  value: string;
  key: CryptoKey;
  aad: string;
}): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesBuffer(iv), additionalData: bytesBuffer(encoder.encode(args.aad)) },
    args.key,
    bytesBuffer(encoder.encode(args.value)),
  );
  return { ciphertext: b64(new Uint8Array(encrypted)), iv: b64(iv) };
}
export async function decryptSecret(args: {
  ciphertext: string;
  iv: string;
  key: CryptoKey;
  aad: string;
}): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytesBuffer(unb64(args.iv)),
      additionalData: bytesBuffer(encoder.encode(args.aad)),
    },
    args.key,
    bytesBuffer(unb64(args.ciphertext)),
  );
  return new TextDecoder().decode(plain);
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytesBuffer(encoder.encode(value)));
  return b64(new Uint8Array(digest));
}
export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return b64(data).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
export async function verifySvix(args: {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  body: string;
  now?: number;
}): Promise<boolean> {
  const when = Number(args.timestamp),
    at = args.now ?? Date.now();
  if (
    !Number.isFinite(when) ||
    Math.abs(at - when * 1000) > 300000 ||
    !args.secret.startsWith("whsec_")
  )
    return false;
  const key = await crypto.subtle.importKey(
      "raw",
      bytesBuffer(unb64(args.secret.slice(6))),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    mac = await crypto.subtle.sign(
      "HMAC",
      key,
      bytesBuffer(encoder.encode(`${args.id}.${args.timestamp}.${args.body}`)),
    ),
    expected = b64(new Uint8Array(mac));
  for (const part of args.signature.split(" "))
    if (part.startsWith("v1,") && constantTime(part.slice(3), expected)) return true;
  return false;
}
function constantTime(a: string, b: string): boolean {
  const aa = encoder.encode(a),
    bb = encoder.encode(b);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
