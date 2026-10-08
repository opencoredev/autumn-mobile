import { describe, expect, it } from "vitest";
import type { InvoiceRaw } from "../src/autumn/schemas";
import { collectPaidInvoices, summarizeRevenue } from "../src/revenue";

const NOW = Date.UTC(2026, 9, 8, 15, 0, 0);
const DAY = 86_400_000;

function invoice(overrides: Partial<InvoiceRaw> & Pick<InvoiceRaw, "id">): InvoiceRaw {
  return {
    customer_id: "cus_1",
    plan_ids: ["pro"],
    status: "paid",
    total: 29,
    amount_paid: 29,
    refunded_amount: 0,
    currency: "usd",
    created_at: NOW - DAY,
    hosted_invoice_url: null,
    items: [],
    ...overrides,
  };
}

describe("summarizeRevenue", () => {
  it("returns 30 zero-filled UTC days, oldest first, ending today", () => {
    const summary = summarizeRevenue({
      invoices: [invoice({ id: "a" })],
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    const days = summary.series[0]?.days ?? [];
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe("2026-09-09");
    expect(days[29]?.date).toBe("2026-10-08");
    expect(days.filter((day) => day.amount !== 0)).toHaveLength(1);
  });

  it("nets out refunds and falls back to total when amount_paid is missing", () => {
    const summary = summarizeRevenue({
      invoices: [
        invoice({ id: "a", total: 100, amount_paid: 100, refunded_amount: 25 }),
        invoice({ id: "b", total: 40, amount_paid: null }),
        invoice({ id: "c", total: 50, amount_paid: 50, refunded_amount: 50 }),
      ],
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    expect(summary.series[0]?.total).toBe(115);
    expect(summary.series[0]?.invoiceCount).toBe(3);
  });

  it("counts only paid invoices", () => {
    const summary = summarizeRevenue({
      invoices: (["draft", "open", "void", "uncollectible", "paid"] as const).map((status) =>
        invoice({ id: status, status, total: 10, amount_paid: 10 }),
      ),
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    expect(summary.series[0]?.total).toBe(10);
  });

  it("ignores invoices outside the window", () => {
    const summary = summarizeRevenue({
      invoices: [
        invoice({ id: "old", created_at: NOW - 31 * DAY, total: 999, amount_paid: 999 }),
        invoice({ id: "future", created_at: NOW + DAY, total: 999, amount_paid: 999 }),
        invoice({ id: "in", created_at: NOW - 29 * DAY, total: 5, amount_paid: 5 }),
      ],
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    expect(summary.series[0]?.total).toBe(5);
  });

  it("groups by currency, uppercases codes, and sorts the largest first", () => {
    const summary = summarizeRevenue({
      invoices: [
        invoice({ id: "u", total: 30, amount_paid: 30 }),
        invoice({ id: "e1", currency: "eur", total: 50, amount_paid: 50 }),
        invoice({ id: "e2", currency: "EUR", total: 25, amount_paid: 25 }),
      ],
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    expect(summary.series.map((series) => [series.currency, series.total])).toEqual([
      ["EUR", 75],
      ["USD", 30],
    ]);
  });

  it("avoids floating point drift in totals", () => {
    const summary = summarizeRevenue({
      invoices: [0.1, 0.2].map((amount, index) =>
        invoice({ id: String(index), total: amount, amount_paid: amount }),
      ),
      now: NOW,
      windowDays: 30,
      truncated: false,
    });
    expect(summary.series[0]?.total).toBe(0.3);
  });

  it("is empty when nothing was paid", () => {
    expect(
      summarizeRevenue({ invoices: [], now: NOW, windowDays: 30, truncated: false }).series,
    ).toEqual([]);
  });
});

describe("collectPaidInvoices", () => {
  const pages: Record<string, { items: InvoiceRaw[]; nextCursor: string | null }> = {
    first: { items: [invoice({ id: "1" })], nextCursor: "c2" },
    c2: { items: [], nextCursor: "c3" },
    c3: { items: [invoice({ id: "2" }), invoice({ id: "3" })], nextCursor: null },
  };
  const fetchPage = async (cursor: string | null) => ({
    ...pages[cursor ?? "first"]!,
    hasMore: true,
  });

  it("follows next_cursor across pages, including empty ones", async () => {
    const result = await collectPaidInvoices({ fetchPage, maxPages: 10 });
    expect(result.invoices.map((row) => row.id)).toEqual(["1", "2", "3"]);
    expect(result.truncated).toBe(false);
  });

  it("stops at the safety cap and reports truncation", async () => {
    const result = await collectPaidInvoices({ fetchPage, maxPages: 2 });
    expect(result.invoices.map((row) => row.id)).toEqual(["1"]);
    expect(result.truncated).toBe(true);
  });
});
