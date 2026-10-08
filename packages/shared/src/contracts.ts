import { z } from "zod";

/**
 * Wire contracts between the mobile app and the Worker.
 *
 * Every response body the Worker returns is described here as a zod schema so
 * the server can type its handlers and the app can parse what it receives.
 * Timestamps are epoch milliseconds. Money amounts are in major currency units
 * (dollars, not cents), matching Autumn's API.
 */

export const API_VERSION_HEADER = "x-autumn-mobile-version";

// ---------------------------------------------------------------- primitives

export const MoneySchema = z.object({
  amount: z.number(),
  currency: z.string().min(3).max(3),
});
export type Money = z.infer<typeof MoneySchema>;

export const OrgIdSchema = z.string().min(1).brand<"OrgId">();
export type OrgId = z.infer<typeof OrgIdSchema>;

export const ErrorCodeSchema = z.enum([
  "unauthorized",
  "not_found",
  "invalid_request",
  "invalid_autumn_key",
  "autumn_unavailable",
  "invalid_signature",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ---------------------------------------------------------------------- auth

export const AuthProviderSchema = z.enum(["google", "apple"]);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

export const GoogleSignInRequestSchema = z.object({ idToken: z.string().min(1) });
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequestSchema>;

export const AppleSignInRequestSchema = z.object({
  identityToken: z.string().min(1),
  /** Apple only sends the name on the very first sign-in, so the app forwards it. */
  displayName: z.string().max(120).nullable(),
});
export type AppleSignInRequest = z.infer<typeof AppleSignInRequestSchema>;

export const UserSchema = z.object({
  id: z.string(),
  provider: AuthProviderSchema,
  displayName: z.string().nullable(),
  createdAt: z.number(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.number(),
  user: UserSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const MeResponseSchema = z.object({ user: UserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------------------------------------------------------------------- orgs

export const KeyEnvSchema = z.enum(["live", "sandbox"]);
export type KeyEnv = z.infer<typeof KeyEnvSchema>;

export const OrgSchema = z.object({
  id: OrgIdSchema,
  name: z.string(),
  /** Last four characters of the secret key. The full key never leaves the Worker. */
  keySuffix: z.string(),
  keyEnv: KeyEnvSchema,
  webhookUrl: z.string(),
  hasWebhookSecret: z.boolean(),
  lastWebhookAt: z.number().nullable(),
  createdAt: z.number(),
});
export type Org = z.infer<typeof OrgSchema>;

export const OrgListResponseSchema = z.object({ orgs: z.array(OrgSchema) });
export type OrgListResponse = z.infer<typeof OrgListResponseSchema>;

const OrgNameSchema = z.string().trim().min(1).max(60);
const SecretKeySchema = z.string().trim().min(8).max(512);

export const CreateOrgRequestSchema = z.object({ name: OrgNameSchema, secretKey: SecretKeySchema });
export type CreateOrgRequest = z.infer<typeof CreateOrgRequestSchema>;

export const RenameOrgRequestSchema = z.object({ name: OrgNameSchema });
export type RenameOrgRequest = z.infer<typeof RenameOrgRequestSchema>;

export const ReplaceKeyRequestSchema = z.object({ secretKey: SecretKeySchema });
export type ReplaceKeyRequest = z.infer<typeof ReplaceKeyRequestSchema>;

export const SetWebhookSecretRequestSchema = z.object({
  /** Svix signing secret from the Autumn dashboard, `whsec_...`. */
  signingSecret: z.string().trim().startsWith("whsec_").min(10).max(256),
});
export type SetWebhookSecretRequest = z.infer<typeof SetWebhookSecretRequestSchema>;

export const OrgResponseSchema = z.object({ org: OrgSchema });
export type OrgResponse = z.infer<typeof OrgResponseSchema>;

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

// ----------------------------------------------------------------- dashboard

export const PlanIntervalSchema = z.enum([
  "one_off",
  "week",
  "month",
  "quarter",
  "semi_annual",
  "year",
]);
export type PlanInterval = z.infer<typeof PlanIntervalSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  group: z.string().nullable(),
  version: z.number(),
  addOn: z.boolean(),
  autoEnable: z.boolean(),
  archived: z.boolean(),
  /** Base price, or null when the plan has no fixed price. */
  price: z.object({ amount: z.number(), interval: PlanIntervalSchema }).nullable(),
  isFree: z.boolean(),
  freeTrial: z
    .object({
      length: z.number(),
      unit: z.enum(["day", "month", "year"]),
      cardRequired: z.boolean(),
    })
    .nullable(),
  itemCount: z.number(),
  createdAt: z.number(),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Display status for a recurring plan. Autumn reports `active` for trials and
 * pending cancellations, so the Worker derives the finer-grained state.
 */
export const SubscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceling",
  "scheduled",
  "expired",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const SubscriptionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  planName: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  status: SubscriptionStatusSchema,
  addOn: z.boolean(),
  quantity: z.number(),
  price: MoneySchema.nullable(),
  interval: PlanIntervalSchema.nullable(),
  startedAt: z.number(),
  trialEndsAt: z.number().nullable(),
  canceledAt: z.number().nullable(),
  currentPeriodEnd: z.number().nullable(),
  createdAt: z.number(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const PurchaseSchema = z.object({
  id: z.string(),
  planId: z.string(),
  planName: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  status: z.enum(["active", "scheduled", "expired"]),
  quantity: z.number(),
  price: MoneySchema.nullable(),
  startedAt: z.number(),
  createdAt: z.number(),
});
export type Purchase = z.infer<typeof PurchaseSchema>;

export const InvoiceStatusSchema = z.enum(["draft", "open", "paid", "void", "uncollectible"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  planId: z.string().nullable(),
  featureName: z.string().nullable(),
  quantity: z.number().nullable(),
  amount: z.number(),
  periodStart: z.number().nullable(),
  periodEnd: z.number().nullable(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  planIds: z.array(z.string()),
  planNames: z.array(z.string()),
  status: InvoiceStatusSchema,
  total: MoneySchema,
  /** amount_paid minus refunds; null when Autumn did not record amount paid. */
  netPaid: MoneySchema.nullable(),
  refunded: z.number(),
  hostedInvoiceUrl: z.string().nullable(),
  createdAt: z.number(),
  lines: z.array(InvoiceLineSchema),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const RevenueDaySchema = z.object({
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: z.string(),
  amount: z.number(),
});
export type RevenueDay = z.infer<typeof RevenueDaySchema>;

export const RevenueSeriesSchema = z.object({
  currency: z.string(),
  total: z.number(),
  invoiceCount: z.number(),
  days: z.array(RevenueDaySchema),
});
export type RevenueSeries = z.infer<typeof RevenueSeriesSchema>;

export const RevenueSummarySchema = z.object({
  windowDays: z.number(),
  /** One series per currency, largest total first. Empty when nothing was paid. */
  series: z.array(RevenueSeriesSchema),
  /** True when pagination stopped at the safety cap and totals may be low. */
  truncated: z.boolean(),
  computedAt: z.number(),
});
export type RevenueSummary = z.infer<typeof RevenueSummarySchema>;

export const OverviewResponseSchema = z.object({
  revenue: RevenueSummarySchema,
  activeSubscriptions: z.number(),
  trialingSubscriptions: z.number(),
  recentSubscriptions: z.array(SubscriptionSchema),
  recentOrders: z.array(InvoiceSchema),
});
export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
export type Page<T> = { readonly items: T[]; readonly nextCursor: string | null };

export const SubscriptionPageSchema = pageSchema(SubscriptionSchema);
export const PurchasePageSchema = pageSchema(PurchaseSchema);
export const InvoicePageSchema = pageSchema(InvoiceSchema);

export const CustomerSummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  createdAt: z.number(),
  env: KeyEnvSchema,
  /** Names of the customer's active base plans, most recent first. */
  planNames: z.array(z.string()),
});
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;
export const CustomerPageSchema = pageSchema(CustomerSummarySchema);

export const CustomerDetailSchema = z.object({
  customer: CustomerSummarySchema.extend({
    stripeId: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
  }),
  subscriptions: z.array(SubscriptionSchema),
  purchases: z.array(PurchaseSchema),
  invoices: z.array(InvoiceSchema),
  lifetimeValue: z.array(MoneySchema),
});
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;

export const PlanListResponseSchema = z.object({ plans: z.array(PlanSchema) });
export type PlanListResponse = z.infer<typeof PlanListResponseSchema>;

export const InvoiceResponseSchema = z.object({ invoice: InvoiceSchema });
export type InvoiceResponse = z.infer<typeof InvoiceResponseSchema>;

// ------------------------------------------------------------- notifications

export const NotificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  purchases: z.boolean(),
  subscriptions: z.boolean(),
  trials: z.boolean(),
  renewals: z.boolean(),
  cancellations: z.boolean(),
  excludeFree: z.boolean(),
});
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  pushEnabled: true,
  purchases: true,
  subscriptions: true,
  trials: true,
  renewals: false,
  cancellations: false,
  excludeFree: false,
} as const satisfies NotificationSettings;

export const NotificationSettingsResponseSchema = z.object({
  settings: NotificationSettingsSchema,
});
export type NotificationSettingsResponse = z.infer<typeof NotificationSettingsResponseSchema>;

export const UpdateNotificationSettingsRequestSchema = NotificationSettingsSchema.partial();
export type UpdateNotificationSettingsRequest = z.infer<
  typeof UpdateNotificationSettingsRequestSchema
>;

export const NotificationKindSchema = z.enum([
  "purchase",
  "subscription",
  "trial",
  "renewal",
  "cancellation",
  "test",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

/** The `data` payload attached to every push. The app parses it on receipt. */
export const PushDataSchema = z.object({
  kind: NotificationKindSchema,
  orgId: z.string(),
  orgName: z.string(),
  /** In-app path to open on tap, e.g. `/org/abc/customer/cus_1`. */
  path: z.string().startsWith("/"),
  title: z.string(),
  body: z.string(),
  amount: MoneySchema.nullable(),
});
export type PushData = z.infer<typeof PushDataSchema>;

export const RegisterDeviceRequestSchema = z.object({
  expoPushToken: z.string().regex(/^(Exponent|Expo)PushToken\[.+\]$/),
  platform: z.enum(["ios", "android"]),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequestSchema>;

export const UnregisterDeviceRequestSchema = RegisterDeviceRequestSchema.pick({
  expoPushToken: true,
});
export type UnregisterDeviceRequest = z.infer<typeof UnregisterDeviceRequestSchema>;

export const TestPushResponseSchema = z.object({ sent: z.number() });
export type TestPushResponse = z.infer<typeof TestPushResponseSchema>;

export const HealthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
