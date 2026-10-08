import type { RevenueSummary } from "@autumn/shared";
export type RevenueInvoice = {
  status: string;
  createdAt: number;
  total: number;
  amountPaid: number | null;
  refundedAmount: number;
  currency: string;
};
export function summarizeRevenue(args: {
  invoices: RevenueInvoice[];
  now: number;
  windowDays: number;
  truncated?: boolean;
}): RevenueSummary {
  const start = args.now - args.windowDays * 86400000;
  const by = new Map<string, { total: number; count: number; days: Map<string, number> }>();
  for (const invoice of args.invoices) {
    if (invoice.status !== "paid" || invoice.createdAt < start || invoice.createdAt > args.now)
      continue;
    const currency = invoice.currency.toLowerCase();
    const net = (invoice.amountPaid ?? invoice.total) - invoice.refundedAmount;
    const date = new Date(invoice.createdAt).toISOString().slice(0, 10);
    const current = by.get(currency) ?? { total: 0, count: 0, days: new Map() };
    current.total += net;
    current.count += 1;
    current.days.set(date, (current.days.get(date) ?? 0) + net);
    by.set(currency, current);
  }
  const dates = Array.from({ length: args.windowDays }, (_, i) =>
    new Date(start + i * 86400000).toISOString().slice(0, 10),
  );
  const series = [...by.entries()]
    .map(([currency, value]) => ({
      currency: currency.toUpperCase(),
      total: value.total,
      invoiceCount: value.count,
      days: dates.map((date) => ({ date, amount: value.days.get(date) ?? 0 })),
    }))
    .sort((a, b) => b.total - a.total);
  return {
    windowDays: args.windowDays,
    series,
    truncated: args.truncated ?? false,
    computedAt: args.now,
  };
}
