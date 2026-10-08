import { z } from "zod";
import {
  formatMoney,
  type Money,
  type NotificationKind,
  type NotificationSettings,
  type Plan,
  type PushData,
} from "@autumn/shared";
import { InvoiceRaw } from "./autumn/schemas";

/** Webhook payloads from Autumn (Svix envelope `{ type, data }`). */

const nullishNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const PlanChange = z.object({
  action: z.enum(["activated", "scheduled", "updated", "expired"]),
  subscription: z
    .object({
      plan_id: z.string(),
      status: z.enum(["active", "scheduled", "expired"]),
      canceled_at: nullishNumber,
      trial_ends_at: nullishNumber,
      started_at: nullishNumber,
    })
    .optional(),
  purchase: z
    .object({ plan_id: z.string(), status: z.enum(["active", "scheduled", "expired"]) })
    .optional(),
  previous_attributes: z
    .object({ canceled_at: z.number().nullable().optional() })
    .nullish()
    .transform((value) => value ?? null),
});

export const BillingUpdated = z.object({
  type: z.literal("billing.updated"),
  data: z.object({
    customer_id: z.string(),
    plan_changes: z.array(PlanChange),
    tags: z.array(z.string()).default([]),
  }),
});

export const InvoiceFinalized = z.object({
  type: z.literal("invoice.finalized"),
  // The body is the invoice exactly as invoices.list returns it.
  data: InvoiceRaw,
});

export const WebhookEvent = z.discriminatedUnion("type", [BillingUpdated, InvoiceFinalized]);
export type WebhookEvent = z.infer<typeof WebhookEvent>;

export const RENEWAL_GRACE_MS = 60 * 60 * 1000;

type Org = { readonly id: string; readonly name: string };

type Candidate = {
  kind: Exclude<NotificationKind, "test">;
  plan: Plan;
  amount: Money | null;
  customerId: string;
  path: string;
};

const SETTING_FOR: Record<Candidate["kind"], keyof NotificationSettings> = {
  purchase: "purchases",
  subscription: "subscriptions",
  trial: "trials",
  renewal: "renewals",
  cancellation: "cancellations",
};

function titleFor(candidate: Candidate): string {
  const name = candidate.plan.name;
  const price = candidate.amount ? `${formatMoney(candidate.amount)} ` : "";
  switch (candidate.kind) {
    case "purchase":
      return `New purchase · ${price}${name}`;
    case "subscription":
      return `New subscription · ${price}${name}`;
    case "trial":
      return `New trial · ${name}`;
    case "renewal":
      return `Renewal · ${price}${name}`;
    case "cancellation":
      return `Subscription canceled · ${name}`;
    default: {
      const _exhaustive: never = candidate.kind;
      return _exhaustive;
    }
  }
}

/** True when a plan change just set `canceled_at` (previously null, now a time). */
function justCanceled(change: z.infer<typeof PlanChange>): boolean {
  const previous = change.previous_attributes;
  if (!previous || !("canceled_at" in previous)) return false;
  return previous.canceled_at === null && typeof change.subscription?.canceled_at === "number";
}

function planPrice(plan: Plan, currency: string): Money | null {
  return plan.price && !plan.isFree ? { amount: plan.price.amount, currency } : null;
}

function candidatesFor(args: {
  event: WebhookEvent;
  org: Org;
  plans: ReadonlyMap<string, Plan>;
  currency: string;
  now: number;
  /** For invoice.finalized: when the customer's subscription to each plan started. */
  subscriptionStartedAt: ReadonlyMap<string, number>;
}): Candidate[] {
  const { event, org } = args;
  if (event.type === "invoice.finalized") {
    const invoice = event.data;
    if (invoice.total <= 0 || !invoice.customer_id) return [];
    for (const planId of invoice.plan_ids) {
      const plan = args.plans.get(planId);
      // Recurring means any plan that isn't one-off, including usage-only plans.
      if (!plan || plan.price?.interval === "one_off") continue;
      const startedAt = args.subscriptionStartedAt.get(planId);
      // A first invoice lands within moments of the subscription starting;
      // `billing.updated` already announced that one as a new subscription.
      if (startedAt === undefined || invoice.created_at - startedAt <= RENEWAL_GRACE_MS) continue;
      return [
        {
          kind: "renewal",
          plan,
          amount: { amount: invoice.total, currency: invoice.currency.toUpperCase() },
          customerId: invoice.customer_id,
          path: `/org/${org.id}/order/${encodeURIComponent(invoice.id)}`,
        },
      ];
    }
    return [];
  }

  const customerId = event.data.customer_id;
  const path = `/org/${org.id}/customer/${encodeURIComponent(customerId)}`;
  const trialEnded = event.data.tags.includes("trial_ended");
  return event.data.plan_changes.flatMap((change): Candidate[] => {
    const planId = change.purchase?.plan_id ?? change.subscription?.plan_id;
    const plan = planId ? args.plans.get(planId) : undefined;
    if (!plan) return [];
    const base = { plan, customerId, path, amount: planPrice(plan, args.currency) };
    if (change.action === "activated" && change.purchase) return [{ ...base, kind: "purchase" }];
    const sub = change.subscription;
    if (!sub) return [];
    if (change.action === "activated") {
      const onTrial = sub.trial_ends_at !== null && sub.trial_ends_at > args.now;
      return [{ ...base, kind: onTrial ? "trial" : "subscription" }];
    }
    if (
      change.action === "updated" &&
      trialEnded &&
      sub.status === "active" &&
      sub.canceled_at === null
    ) {
      return [{ ...base, kind: "subscription" }];
    }
    if (change.action === "updated" && justCanceled(change)) {
      return [{ ...base, kind: "cancellation", amount: null }];
    }
    return [];
  });
}

/**
 * Decides which pushes an Autumn event produces for one user, applying their
 * settings. Pure: everything it needs is passed in.
 */
export function classifyEvent(args: {
  event: WebhookEvent;
  org: Org;
  plans: ReadonlyMap<string, Plan>;
  currency: string;
  settings: NotificationSettings;
  now: number;
  customerName: string | null;
  subscriptionStartedAt?: ReadonlyMap<string, number>;
}): PushData[] {
  if (!args.settings.pushEnabled) return [];
  return candidatesFor({ ...args, subscriptionStartedAt: args.subscriptionStartedAt ?? new Map() })
    .filter((candidate) => args.settings[SETTING_FOR[candidate.kind]])
    .filter(
      (candidate) =>
        !(args.settings.excludeFree && candidate.plan.isFree && candidate.kind !== "purchase"),
    )
    .map((candidate) => ({
      kind: candidate.kind,
      orgId: args.org.id,
      orgName: args.org.name,
      path: candidate.path,
      title: titleFor(candidate),
      body: `${args.customerName ?? candidate.customerId} · ${args.org.name}`,
      amount: candidate.amount,
    }));
}

/** Plan IDs whose subscription start time the renewal check needs. */
export function renewalPlanIds(event: WebhookEvent, plans: ReadonlyMap<string, Plan>): string[] {
  if (event.type !== "invoice.finalized" || event.data.total <= 0) return [];
  return event.data.plan_ids.filter((id) => {
    const plan = plans.get(id);
    return plan !== undefined && plan.price?.interval !== "one_off";
  });
}
