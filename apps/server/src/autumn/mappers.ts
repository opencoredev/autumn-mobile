import type {
  CustomerSummary,
  Invoice,
  Money,
  Plan,
  Purchase,
  Subscription,
  SubscriptionStatus,
} from "@autumn/shared";
import { SubscriptionRaw, PurchaseRaw, parseRows } from "./schemas";
import type { CustomerRaw, InvoiceRaw, PlanRaw } from "./schemas";

/** Pure transforms from Autumn's wire shapes to the shared contracts. */

export type PlanMap = ReadonlyMap<string, Plan>;
export type NameMap = ReadonlyMap<string, string>;

function money(amount: number, currency: string): Money {
  return { amount, currency: currency.toUpperCase() };
}

export function planView(raw: PlanRaw): Plan {
  const itemCharges = raw.items.some((item) => {
    const price = item.price;
    if (!price) return false;
    if ((price.amount ?? 0) > 0) return true;
    return (price.tiers ?? []).some((tier) => (tier.amount ?? 0) > 0);
  });
  const basePrice = raw.price ?? null;
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    group: raw.group,
    version: raw.version,
    addOn: raw.add_on,
    autoEnable: raw.auto_enable,
    archived: raw.archived,
    price: basePrice ? { amount: basePrice.amount, interval: basePrice.interval } : null,
    isFree: (basePrice === null || basePrice.amount <= 0) && !itemCharges,
    freeTrial: raw.free_trial
      ? {
          length: raw.free_trial.duration_length,
          unit: raw.free_trial.duration_type,
          cardRequired: raw.free_trial.card_required,
        }
      : null,
    itemCount: raw.items.length,
    createdAt: raw.created_at,
  };
}

/**
 * Autumn reports trials and pending cancellations as `active`; the app wants
 * the finer state. Order matters: an expired row is expired even if it was
 * once a trial.
 */
export function deriveStatus(raw: SubscriptionRaw, now: number): SubscriptionStatus {
  if (raw.status === "expired" || (raw.expires_at !== null && raw.expires_at <= now)) {
    return "expired";
  }
  if (raw.status === "scheduled") return "scheduled";
  if (raw.past_due) return "past_due";
  if (raw.trial_ends_at !== null && raw.trial_ends_at > now) return "trialing";
  if (raw.canceled_at !== null) return "canceling";
  return "active";
}

function planPrice(plan: Plan | undefined, quantity: number, currency: string): Money | null {
  if (!plan?.price || plan.isFree) return null;
  return money(plan.price.amount * quantity, currency);
}

export function subscriptionView(args: {
  raw: SubscriptionRaw;
  customerId: string;
  plans: PlanMap;
  names: NameMap;
  currency: string;
  now: number;
}): Subscription {
  const { raw } = args;
  const plan = args.plans.get(raw.plan_id);
  return {
    id: raw.id,
    planId: raw.plan_id,
    planName: plan?.name ?? raw.plan_id,
    customerId: args.customerId,
    customerName: args.names.get(args.customerId) ?? null,
    status: deriveStatus(raw, args.now),
    addOn: raw.add_on || plan?.addOn === true,
    quantity: raw.quantity,
    price: planPrice(plan, raw.quantity, args.currency),
    interval: plan?.price?.interval ?? null,
    startedAt: raw.started_at,
    trialEndsAt: raw.trial_ends_at,
    canceledAt: raw.canceled_at,
    currentPeriodEnd: raw.current_period_end,
    createdAt: raw.created_at ?? raw.started_at,
  };
}

export function purchaseView(args: {
  raw: PurchaseRaw;
  customerId: string;
  plans: PlanMap;
  names: NameMap;
  currency: string;
}): Purchase {
  const { raw } = args;
  const plan = args.plans.get(raw.plan_id);
  return {
    id: raw.id ?? `${args.customerId}:${raw.plan_id}:${raw.started_at}`,
    planId: raw.plan_id,
    planName: plan?.name ?? raw.plan_id,
    customerId: args.customerId,
    customerName: args.names.get(args.customerId) ?? null,
    status: raw.status,
    quantity: raw.quantity,
    price: planPrice(plan, raw.quantity, args.currency),
    startedAt: raw.started_at,
    createdAt: raw.created_at ?? raw.started_at,
  };
}

/** Net collected on an invoice: amount paid (or total when unrecorded) minus refunds. */
export function netPaidAmount(raw: InvoiceRaw): number {
  return (raw.amount_paid ?? raw.total) - raw.refunded_amount;
}

export function invoiceView(args: { raw: InvoiceRaw; plans: PlanMap; names: NameMap }): Invoice {
  const { raw } = args;
  return {
    id: raw.id,
    customerId: raw.customer_id,
    customerName: raw.customer_id ? (args.names.get(raw.customer_id) ?? null) : null,
    planIds: raw.plan_ids,
    planNames: raw.plan_ids.map((id) => args.plans.get(id)?.name ?? id),
    status: raw.status,
    total: money(raw.total, raw.currency),
    netPaid: raw.status === "paid" ? money(netPaidAmount(raw), raw.currency) : null,
    refunded: raw.refunded_amount,
    hostedInvoiceUrl: raw.hosted_invoice_url,
    createdAt: raw.created_at,
    lines: raw.items.map((item) => ({
      id: item.id,
      description: item.description,
      planId: item.plan_id,
      featureName: item.feature_name,
      quantity: item.quantity,
      amount: item.amount,
      periodStart: item.period_start,
      periodEnd: item.period_end,
    })),
  };
}

export function embeddedSubscriptions(raw: CustomerRaw): SubscriptionRaw[] {
  return parseRows(SubscriptionRaw, raw.subscriptions);
}

export function embeddedPurchases(raw: CustomerRaw): PurchaseRaw[] {
  return parseRows(PurchaseRaw, raw.purchases);
}

export function customerSummary(args: {
  raw: CustomerRaw & { id: string };
  plans: PlanMap;
  now: number;
}): CustomerSummary {
  const active = embeddedSubscriptions(args.raw)
    .filter((sub) => !sub.add_on && deriveStatus(sub, args.now) !== "expired")
    .sort((a, b) => b.started_at - a.started_at);
  return {
    id: args.raw.id,
    name: args.raw.name,
    createdAt: args.raw.created_at,
    env: args.raw.env,
    planNames: active.map((sub) => args.plans.get(sub.plan_id)?.name ?? sub.plan_id),
  };
}

/** Sum of net paid per currency, largest first. */
export function lifetimeValue(invoices: readonly InvoiceRaw[]): Money[] {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    if (invoice.status !== "paid") continue;
    const currency = invoice.currency.toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + netPaidAmount(invoice));
  }
  return [...totals]
    .map(([currency, amount]) => ({ amount: Math.round(amount * 100) / 100, currency }))
    .sort((a, b) => b.amount - a.amount);
}
