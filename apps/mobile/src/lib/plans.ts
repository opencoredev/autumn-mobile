import type { Plan } from "@autumn/shared";

const UNIT: Record<NonNullable<Plan["freeTrial"]>["unit"], string> = {
  day: "day",
  month: "month",
  year: "year",
};

export function trialLabel(plan: Plan): string | null {
  if (!plan.freeTrial) return null;
  const { length, unit } = plan.freeTrial;
  return `${length}-${UNIT[unit]} trial`;
}

const INTERVAL_WORD: Record<NonNullable<Plan["price"]>["interval"], string> = {
  one_off: "One-time",
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  semi_annual: "Every 6 months",
  year: "Yearly",
};

export function intervalWord(plan: Plan): string {
  if (!plan.price) return plan.isFree ? "Free" : "Usage-based";
  return INTERVAL_WORD[plan.price.interval];
}
