import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, importEncryptionKey, verifySvix } from "../src/crypto";
import { openSecret, sealSecret } from "../src/secrets";
import { randomWebhookSecret, signSvix } from "./harness";

const masterKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const SECRET = ["am", "sk", "live", "roundtrip", "77aa"].join("_");

describe("AES-GCM secret storage", () => {
  it("round-trips a secret", async () => {
    const key = masterKey();
    const sealed = await sealSecret({
      masterKey: key,
      userId: "u1",
      orgId: "o1",
      purpose: "autumn-key",
      value: SECRET,
    });
    expect(sealed.ciphertext).not.toContain(SECRET);
    await expect(
      openSecret({ masterKey: key, userId: "u1", orgId: "o1", purpose: "autumn-key", ...sealed }),
    ).resolves.toBe(SECRET);
  });

  it("uses a fresh IV for every encryption", async () => {
    const key = await importEncryptionKey(masterKey());
    const first = await encryptSecret({ value: SECRET, key, aad: "a" });
    const second = await encryptSecret({ value: SECRET, key, aad: "a" });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext", async () => {
    const key = await importEncryptionKey(masterKey());
    const sealed = await encryptSecret({ value: SECRET, key, aad: "a" });
    const bytes = Uint8Array.from(atob(sealed.ciphertext), (char) => char.charCodeAt(0));
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(
      decryptSecret({ ...sealed, ciphertext: tampered, key, aad: "a" }),
    ).rejects.toThrow();
  });

  it("refuses to decrypt a row moved to another user, org or purpose", async () => {
    const key = masterKey();
    const sealed = await sealSecret({
      masterKey: key,
      userId: "u1",
      orgId: "o1",
      purpose: "autumn-key",
      value: SECRET,
    });
    for (const moved of [
      { userId: "u2", orgId: "o1", purpose: "autumn-key" as const },
      { userId: "u1", orgId: "o2", purpose: "autumn-key" as const },
      { userId: "u1", orgId: "o1", purpose: "webhook-secret" as const },
    ]) {
      await expect(openSecret({ masterKey: key, ...moved, ...sealed })).rejects.toThrow();
    }
  });

  it("requires a 256-bit master key", async () => {
    const short = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    await expect(importEncryptionKey(short)).rejects.toThrow(/32 bytes/);
    await expect(importEncryptionKey("not base64!")).rejects.toThrow();
  });

  it("refuses to decrypt with a different master key", async () => {
    const sealed = await sealSecret({
      masterKey: masterKey(),
      userId: "u",
      orgId: "o",
      purpose: "autumn-key",
      value: SECRET,
    });
    await expect(
      openSecret({
        masterKey: masterKey(),
        userId: "u",
        orgId: "o",
        purpose: "autumn-key",
        ...sealed,
      }),
    ).rejects.toThrow();
  });
});

describe("Svix signature verification", () => {
  const body = JSON.stringify({ type: "billing.updated", data: {} });
  const id = "msg_test_1";
  const now = 1_790_000_000_000;
  const timestamp = Math.floor(now / 1000);

  it("accepts a valid signature", async () => {
    const secret = randomWebhookSecret();
    const signature = await signSvix({ secret, id, timestamp, body });
    expect(
      await verifySvix({ secret, id, timestamp: String(timestamp), signature, body, now }),
    ).toBe(true);
  });

  it("rejects the wrong secret", async () => {
    const signature = await signSvix({ secret: randomWebhookSecret(), id, timestamp, body });
    expect(
      await verifySvix({
        secret: randomWebhookSecret(),
        id,
        timestamp: String(timestamp),
        signature,
        body,
        now,
      }),
    ).toBe(false);
  });

  it("rejects a tampered body or id", async () => {
    const secret = randomWebhookSecret();
    const signature = await signSvix({ secret, id, timestamp, body });
    expect(
      await verifySvix({
        secret,
        id,
        timestamp: String(timestamp),
        signature,
        body: `${body} `,
        now,
      }),
    ).toBe(false);
    expect(
      await verifySvix({
        secret,
        id: "msg_other",
        timestamp: String(timestamp),
        signature,
        body,
        now,
      }),
    ).toBe(false);
  });

  it("rejects timestamps more than five minutes off in either direction", async () => {
    const secret = randomWebhookSecret();
    for (const offset of [-301, 301]) {
      const stamp = timestamp + offset;
      const signature = await signSvix({ secret, id, timestamp: stamp, body });
      expect(await verifySvix({ secret, id, timestamp: String(stamp), signature, body, now })).toBe(
        false,
      );
    }
    const nearStamp = timestamp - 299;
    const nearSignature = await signSvix({ secret, id, timestamp: nearStamp, body });
    expect(
      await verifySvix({
        secret,
        id,
        timestamp: String(nearStamp),
        signature: nearSignature,
        body,
        now,
      }),
    ).toBe(true);
  });

  it("accepts when any one of several signatures matches and ignores other versions", async () => {
    const secret = randomWebhookSecret();
    const good = await signSvix({ secret, id, timestamp, body });
    const other = await signSvix({ secret: randomWebhookSecret(), id, timestamp, body });
    const header = `${other} v2,${good.slice(3)} ${good}`;
    expect(
      await verifySvix({ secret, id, timestamp: String(timestamp), signature: header, body, now }),
    ).toBe(true);
    expect(
      await verifySvix({
        secret,
        id,
        timestamp: String(timestamp),
        signature: `v2,${good.slice(3)}`,
        body,
        now,
      }),
    ).toBe(false);
  });

  it("rejects malformed secrets and timestamps", async () => {
    const secret = randomWebhookSecret();
    const signature = await signSvix({ secret, id, timestamp, body });
    expect(
      await verifySvix({
        secret: secret.slice(6),
        id,
        timestamp: String(timestamp),
        signature,
        body,
        now,
      }),
    ).toBe(false);
    expect(await verifySvix({ secret, id, timestamp: "not-a-number", signature, body, now })).toBe(
      false,
    );
  });
});
