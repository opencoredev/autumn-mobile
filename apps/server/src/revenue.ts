import type { RevenueSummary } from "@autumn/shared";
import type { ListPage } from "./autumn/client";
import { netPaidAmount } from "./autumn/mappers";
import type { InvoiceRaw } from "./autumn/schemas";

const DAY_MS = 86_400_000;

/** UTC calendar day for a timestamp, `YYYY-MM-DD`. */
function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Sums net paid revenue (amount paid minus refunds; total when amount paid
 * wasn't recorded) for paid invoices in the last `windowDays` UTC days,
 * one series per currency, largest first, with every day zero-filled.
 */
export function summarizeRevenue(args: {
  invoices: readonly InvoiceRaw[];
  now: number;
  windowDays: number;
  truncated: boolean;
}): RevenueSummary {
  const todayStart = Date.parse(`${utcDay(args.now)}T00:00:00.000Z`);
  const windowStart = todayStart - (args.windowDays - 1) * DAY_MS;
  const days = Array.from({ length: args.windowDays }, (_, index) =>
    utcDay(windowStart + index * DAY_MS),
  );

  const byCurrency = new Map<string, { total: number; count: number; days: Map<string, number> }>();
  for (const invoice of args.invoices) {
    if (invoice.status !== "paid") continue;
    if (invoice.created_at < windowStart || invoice.created_at > args.now) continue;
    const currency = invoice.currency.toUpperCase();
    const net = netPaidAmount(invoice);
    const bucket = byCurrency.get(currency) ?? { total: 0, count: 0, days: new Map() };
    const day = utcDay(invoice.created_at);
    bucket.total += net;
    bucket.count += 1;
    bucket.days.set(day, (bucket.days.get(day) ?? 0) + net);
    byCurrency.set(currency, bucket);
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  const series = [...byCurrency]
    .map(([currency, bucket]) => ({
      currency,
      total: round(bucket.total),
      invoiceCount: bucket.count,
      days: days.map((date) => ({ date, amount: round(bucket.days.get(date) ?? 0) })),
    }))
    .sort((a, b) => b.total - a.total);

  return { windowDays: args.windowDays, series, truncated: args.truncated, computedAt: args.now };
}

/**
 * Pages through paid invoices. Autumn doesn't document the sort order, so it
 * reads every page up to `maxPages` rather than stopping at the window edge,
 * and reports `truncated` if it hit the cap.
 */
export async function collectPaidInvoices(args: {
  fetchPage: (cursor: string | null) => Promise<ListPage<InvoiceRaw>>;
  maxPages: number;
}): Promise<{ invoices: InvoiceRaw[]; truncated: boolean }> {
  const invoices: InvoiceRaw[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < args.maxPages; page += 1) {
    const result = await args.fetchPage(cursor);
    invoices.push(...result.items);
    if (!result.nextCursor) return { invoices, truncated: false };
    cursor = result.nextCursor;
  }
  return { invoices, truncated: true };
}
