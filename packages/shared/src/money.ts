import type { Money, PlanInterval } from "./contracts";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  const cached = formatters.get(key);
  if (cached) return cached;
  const created = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    ...(compact
      ? { notation: "compact", maximumFractionDigits: 1 }
      : { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  });
  formatters.set(key, created);
  return created;
}

/** `$29`, `$29.99`, `€1,204.50`. Whole amounts drop the decimals. */
export function formatMoney(money: Money, options: { compact?: boolean } = {}): string {
  return formatter(money.currency, options.compact ?? false).format(money.amount);
}

const INTERVAL_SUFFIX: Record<PlanInterval, string> = {
  one_off: "",
  week: "/wk",
  month: "/mo",
  quarter: "/qtr",
  semi_annual: "/6mo",
  year: "/yr",
};

export function intervalSuffix(interval: PlanInterval | null): string {
  return interval ? INTERVAL_SUFFIX[interval] : "";
}
