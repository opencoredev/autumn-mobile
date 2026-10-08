import { formatMoney } from "@autumn/shared";
import type { NotificationSettings, NotificationKind, PushData } from "@autumn/shared";
export type PlanInfo = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  isFree: boolean;
  interval?: string;
};
export type BillingEvent = {
  type: "billing.updated";
  data: {
    customer_id: string;
    plan_changes: Array<{
      action: string;
      subscription?: {
        plan_id: string;
        status: string;
        past_due?: boolean;
        started_at?: number;
        canceled_at?: number | null;
        trial_ends_at?: number | null;
      };
      purchase?: { plan_id: string; status: string; expires_at?: number | null };
    }>;
    tags?: string[];
  };
};
export type Classified = PushData;
export function classifyEvent(args: {
  event: BillingEvent;
  plans: Map<string, PlanInfo>;
  settings: NotificationSettings;
  now: number;
  orgName: string;
  orgId: string;
  customerName?: string | null;
}): Classified[] {
  if (!args.settings.pushEnabled) return [];
  const result: Classified[] = [];
  for (const change of args.event.data.plan_changes) {
    const plan = args.plans.get(change.purchase?.plan_id ?? change.subscription?.plan_id ?? "");
    if (!plan) continue;
    let kind: NotificationKind | null = null;
    if (change.purchase && change.action === "activated") kind = "purchase";
    else if (change.subscription && change.action === "activated")
      kind =
        change.subscription.trial_ends_at != null && change.subscription.trial_ends_at > args.now
          ? "trial"
          : "subscription";
    else if (
      change.subscription &&
      change.action === "updated" &&
      args.event.data.tags?.includes("trial_ended") &&
      change.subscription.status === "active"
    )
      kind = "subscription";
    else if (
      change.subscription &&
      change.action === "updated" &&
      change.subscription.canceled_at != null
    )
      kind = "cancellation";
    if (
      !kind ||
      !args.settings[
        kind === "purchase"
          ? "purchases"
          : kind === "trial"
            ? "trials"
            : kind === "subscription"
              ? "subscriptions"
              : "cancellations"
      ] ||
      (args.settings.excludeFree && plan.isFree && kind !== "purchase")
    )
      continue;
    const amount =
      plan.amount == null ? null : { amount: plan.amount, currency: plan.currency.toLowerCase() };
    const label = amount ? formatMoney(amount) : plan.name;
    const title =
      kind === "purchase"
        ? `New purchase · ${label} ${plan.name}`
        : kind === "trial"
          ? `New trial · ${plan.name}`
          : kind === "cancellation"
            ? `Subscription canceled · ${plan.name}`
            : `New subscription · ${label}`;
    const path = `/org/${args.orgId}/customer/${args.event.data.customer_id}`;
    result.push({
      kind,
      orgId: args.orgId,
      orgName: args.orgName,
      path,
      title,
      body: `${args.customerName ?? args.event.data.customer_id} · ${args.orgName}`,
      amount,
    });
  }
  return result;
}
