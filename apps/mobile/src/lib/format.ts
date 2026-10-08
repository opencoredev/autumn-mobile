import type { SubscriptionStatus } from "@autumn/shared";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  const future = diff < 0;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) return "just now";
  if (abs < HOUR) text = `${Math.round(abs / MINUTE)}m`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`;
  else if (abs < 30 * DAY) text = `${Math.round(abs / DAY)}d`;
  else return shortDate(timestamp);
  return future ? `in ${text}` : `${text} ago`;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function shortDate(timestamp: number): string {
  return dateFormatter.format(timestamp);
}

export function longDate(timestamp: number): string {
  return longDateFormatter.format(timestamp);
}

/** `2026-10-08` (UTC) → `Oct 8`. */
export function dayLabel(isoDay: string): string {
  const [year, month, day] = isoDay.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return isoDay;
  return dateFormatter.format(Date.UTC(year, month - 1, day, 12));
}

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Past due",
  canceling: "Canceling",
  scheduled: "Scheduled",
  expired: "Expired",
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase();
}
