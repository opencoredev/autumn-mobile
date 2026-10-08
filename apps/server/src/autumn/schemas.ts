import { z } from "zod";

/**
 * Raw Autumn API shapes (API version 2.5.0), parsed at the boundary. Fields
 * the docs mark nullable are `nullish` so older records still parse; unknown
 * keys are stripped. Amounts are in major currency units.
 */

export const AUTUMN_API_VERSION = "2.5.0";

const nullishNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);
const nullishString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);

export const PlanIntervalRaw = z.enum([
  "one_off",
  "week",
  "month",
  "quarter",
  "semi_annual",
  "year",
]);

export const PlanRaw = z.object({
  id: z.string(),
  name: z.string(),
  description: nullishString,
  group: nullishString,
  version: z.number().default(1),
  add_on: z.boolean().default(false),
  auto_enable: z.boolean().default(false),
  archived: z.boolean().default(false),
  price: z.object({ amount: z.number(), interval: PlanIntervalRaw }).nullish(),
  items: z
    .array(
      z.object({
        price: z
          .object({
            amount: z.number().nullish(),
            tiers: z.array(z.object({ amount: z.number().nullish() })).nullish(),
          })
          .nullish(),
      }),
    )
    .default([]),
  free_trial: z
    .object({
      duration_length: z.number(),
      duration_type: z.enum(["day", "month", "year"]),
      card_required: z.boolean().default(false),
    })
    .nullish(),
  created_at: z.number().default(0),
});
export type PlanRaw = z.infer<typeof PlanRaw>;

export const InvoiceRaw = z.object({
  id: z.string(),
  customer_id: nullishString,
  plan_ids: z.array(z.string()).default([]),
  status: z.enum(["draft", "open", "void", "paid", "uncollectible"]),
  total: z.number(),
  amount_paid: nullishNumber,
  refunded_amount: z.number().default(0),
  currency: z.string().min(3),
  created_at: z.number(),
  hosted_invoice_url: nullishString,
  items: z
    .array(
      z.object({
        id: z.string(),
        description: z.string().default(""),
        plan_id: nullishString,
        feature_name: nullishString,
        quantity: nullishNumber,
        amount: z.number(),
        period_start: nullishNumber,
        period_end: nullishNumber,
      }),
    )
    .default([]),
});
export type InvoiceRaw = z.infer<typeof InvoiceRaw>;

export const SubscriptionRaw = z.object({
  id: z.string(),
  plan_id: z.string(),
  add_on: z.boolean().default(false),
  past_due: z.boolean().default(false),
  canceled_at: nullishNumber,
  expires_at: nullishNumber,
  trial_ends_at: nullishNumber,
  started_at: z.number(),
  current_period_end: nullishNumber,
  quantity: z.number().default(1),
  status: z.enum(["active", "scheduled", "expired"]),
  // Absent on subscriptions embedded in a customer object.
  customer_id: z.string().optional(),
  created_at: z.number().optional(),
});
export type SubscriptionRaw = z.infer<typeof SubscriptionRaw>;

export const PurchaseRaw = z.object({
  id: z.string().optional(),
  plan_id: z.string(),
  expires_at: nullishNumber,
  started_at: z.number(),
  quantity: z.number().default(1),
  status: z.enum(["active", "scheduled", "expired"]),
  customer_id: z.string().optional(),
  created_at: z.number().optional(),
});
export type PurchaseRaw = z.infer<typeof PurchaseRaw>;

export const CustomerRaw = z.object({
  id: nullishString,
  name: nullishString,
  // `email` and free-form `metadata` exist in Autumn's response. Neither is
  // parsed or kept: metadata can hold anything, including personal data.
  created_at: z.number().default(0),
  env: z.enum(["sandbox", "live"]).default("live"),
  stripe_id: nullishString,
  subscriptions: z.array(z.unknown()).default([]),
  purchases: z.array(z.unknown()).default([]),
  invoices: z.array(z.unknown()).optional(),
});
export type CustomerRaw = z.infer<typeof CustomerRaw>;

export const ListEnvelope = z.object({
  list: z.array(z.unknown()),
  next_cursor: nullishString,
  has_more: z.boolean().optional(),
});

/** Keeps the rows that parse. A malformed row shouldn't blank a whole screen. */
export function parseRows<S extends z.ZodType>(schema: S, rows: readonly unknown[]): z.infer<S>[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}
