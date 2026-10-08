import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, importEncryptionKey } from "../crypto";
import { summarizeRevenue } from "../revenue";
import { classifyEvent } from "../notifications";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@autumn/shared";

describe("crypto", () => {
  it("round trips and rejects tampering/AAD", async () => {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const key = await importEncryptionKey(raw);
    const encrypted = await encryptSecret({ value: "am_sk_test_demo_key", key, aad: "u:o:key" });
    await expect(decryptSecret({ ...encrypted, key, aad: "u:o:key" })).resolves.toBe(
      "am_sk_test_demo_key",
    );
    await expect(decryptSecret({ ...encrypted, key, aad: "u:o:other" })).rejects.toThrow();
  });
});
describe("revenue", () => {
  it("groups currencies, refunds and fills days", () => {
    const now = Date.UTC(2026, 0, 31);
    const result = summarizeRevenue({
      now,
      windowDays: 3,
      invoices: [
        {
          status: "paid",
          createdAt: now,
          total: 10,
          amountPaid: null,
          refundedAmount: 2,
          currency: "usd",
        },
        {
          status: "void",
          createdAt: now,
          total: 99,
          amountPaid: 99,
          refundedAmount: 0,
          currency: "usd",
        },
      ],
    });
    expect(result.series[0]?.total).toBe(8);
    expect(result.series[0]?.days).toHaveLength(3);
  });
});
describe("notifications", () => {
  it("classifies purchases and filters disabled push", () => {
    const event = {
      type: "billing.updated" as const,
      data: {
        customer_id: "cus_demo_1",
        plan_changes: [{ action: "activated", purchase: { plan_id: "pro", status: "active" } }],
        tags: [],
      },
    };
    const plans = new Map([
      ["pro", { id: "pro", name: "Pro", amount: 29, currency: "usd", isFree: false }],
    ]);
    expect(
      classifyEvent({
        event,
        plans,
        settings: DEFAULT_NOTIFICATION_SETTINGS,
        now: Date.now(),
        orgName: "Acme Labs",
        orgId: "org_demo",
      })[0]?.kind,
    ).toBe("purchase");
    expect(
      classifyEvent({
        event,
        plans,
        settings: { ...DEFAULT_NOTIFICATION_SETTINGS, pushEnabled: false },
        now: Date.now(),
        orgName: "Acme Labs",
        orgId: "org_demo",
      }),
    ).toHaveLength(0);
  });
});
