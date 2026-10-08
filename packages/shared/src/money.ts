import type { Money, PlanInterval } from "./contracts";

const formatters = new Map<string, Intl.NumberFormat>();

type Style = "compact" | "whole" | "cents";

function formatter(currency: string, style: Style): Intl.NumberFormat {
  const key = `${currency}:${style}`;
  const cached = formatters.get(key);
  if (cached) return cached;
  const digits =
    style === "compact"
      ? { notation: "compact" as const, maximumFractionDigits: 1 }
      : style === "whole"
        ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const created = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    ...digits,
  });
  formatters.set(key, created);
  return created;
}

/** `$29`, `$29.99`, `$31.50`, `€1,204.50`. Whole amounts drop the decimals. */
export function formatMoney(money: Money, options: { compact?: boolean } = {}): string {
  if (options.compact) return formatter(money.currency, "compact").format(money.amount);
  const whole = Math.abs(money.amount - Math.round(money.amount)) < 0.005;
  return formatter(money.currency, whole ? "whole" : "cents").format(money.amount);
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
