/** Signs payloads the way Autumn's webhook sender (Svix) does. Test and script helper. */
export async function signSvix(args: {
  secret: string;
  id: string;
  timestamp: number;
  body: string;
}) {
  const raw = Uint8Array.from(atob(args.secret.slice("whsec_".length)), (char) =>
    char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${args.id}.${args.timestamp}.${args.body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

export function randomWebhookSecret(): string {
  return `whsec_${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))}`;
}
