import type { z } from "zod";
import {
  CustomerDetailSchema,
  CustomerPageSchema,
  ErrorBodySchema,
  HealthResponseSchema,
  InvoicePageSchema,
  InvoiceResponseSchema,
  MeResponseSchema,
  NotificationSettingsResponseSchema,
  OkResponseSchema,
  OrgListResponseSchema,
  OrgResponseSchema,
  OverviewResponseSchema,
  PlanListResponseSchema,
  PurchasePageSchema,
  SessionResponseSchema,
  SubscriptionPageSchema,
  TestPushResponseSchema,
  type AppleSignInRequest,
  type CreateOrgRequest,
  type ErrorCode,
  type GoogleSignInRequest,
  type OrgId,
  type RegisterDeviceRequest,
  type UnregisterDeviceRequest,
  type UpdateNotificationSettingsRequest,
} from "./contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "network" | "invalid_response";

  constructor(args: { status: number; code: ApiError["code"]; message: string }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
  }
}

export type ApiClientOptions = {
  readonly baseUrl: string;
  /** Returns the current session token, or null when signed out. */
  readonly getToken: () => string | null;
  /** Called when the Worker rejects the session so the app can sign out. */
  readonly onUnauthorized?: () => void;
  readonly fetch?: typeof fetch;
};

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Query = Record<string, string | null | undefined>;

function withQuery(path: string, query: Query | undefined): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request<S extends z.ZodType>(args: {
    method: Method;
    path: string;
    schema: S;
    body?: unknown;
    query?: Query;
  }): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: "application/json" };
    const token = options.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (args.body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await doFetch(`${baseUrl}${withQuery(args.path, args.query)}`, {
        method: args.method,
        headers,
        ...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
      });
    } catch {
      throw new ApiError({ status: 0, code: "network", message: "Can't reach the server." });
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.();
      const parsedError = ErrorBodySchema.safeParse(payload);
      if (parsedError.success) {
        throw new ApiError({ status: response.status, ...parsedError.data.error });
      }
      throw new ApiError({
        status: response.status,
        code: "internal",
        message: `Request failed with status ${response.status}`,
      });
    }

    const parsed = args.schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError({
        status: response.status,
        code: "invalid_response",
        message: `Unexpected response from ${args.path}`,
      });
    }
    return parsed.data;
  }

  const org = (orgId: OrgId) => `/v1/orgs/${encodeURIComponent(orgId)}`;

  return {
    health: () => request({ method: "GET", path: "/health", schema: HealthResponseSchema }),

    signInWithGoogle: (body: GoogleSignInRequest) =>
      request({ method: "POST", path: "/v1/auth/google", body, schema: SessionResponseSchema }),
    signInWithApple: (body: AppleSignInRequest) =>
      request({ method: "POST", path: "/v1/auth/apple", body, schema: SessionResponseSchema }),
    signOut: () => request({ method: "POST", path: "/v1/auth/logout", schema: OkResponseSchema }),
    me: () => request({ method: "GET", path: "/v1/me", schema: MeResponseSchema }),

    listOrgs: () => request({ method: "GET", path: "/v1/orgs", schema: OrgListResponseSchema }),
    createOrg: (body: CreateOrgRequest) =>
      request({ method: "POST", path: "/v1/orgs", body, schema: OrgResponseSchema }),
    renameOrg: (orgId: OrgId, name: string) =>
      request({ method: "PATCH", path: org(orgId), body: { name }, schema: OrgResponseSchema }),
    replaceOrgKey: (orgId: OrgId, secretKey: string) =>
      request({
        method: "PUT",
        path: `${org(orgId)}/key`,
        body: { secretKey },
        schema: OrgResponseSchema,
      }),
    setWebhookSecret: (orgId: OrgId, signingSecret: string) =>
      request({
        method: "PUT",
        path: `${org(orgId)}/webhook-secret`,
        body: { signingSecret },
        schema: OrgResponseSchema,
      }),
    deleteOrg: (orgId: OrgId) =>
      request({ method: "DELETE", path: org(orgId), schema: OkResponseSchema }),
    sendTestPush: (orgId: OrgId) =>
      request({ method: "POST", path: `${org(orgId)}/test-push`, schema: TestPushResponseSchema }),

    overview: (orgId: OrgId) =>
      request({ method: "GET", path: `${org(orgId)}/overview`, schema: OverviewResponseSchema }),
    subscriptions: (orgId: OrgId, cursor: string | null) =>
      request({
        method: "GET",
        path: `${org(orgId)}/subscriptions`,
        query: { cursor },
        schema: SubscriptionPageSchema,
      }),
    purchases: (orgId: OrgId, cursor: string | null) =>
      request({
        method: "GET",
        path: `${org(orgId)}/purchases`,
        query: { cursor },
        schema: PurchasePageSchema,
      }),
    invoices: (orgId: OrgId, cursor: string | null) =>
      request({
        method: "GET",
        path: `${org(orgId)}/invoices`,
        query: { cursor },
        schema: InvoicePageSchema,
      }),
    invoice: (orgId: OrgId, invoiceId: string) =>
      request({
        method: "GET",
        path: `${org(orgId)}/invoices/${encodeURIComponent(invoiceId)}`,
        schema: InvoiceResponseSchema,
      }),
    plans: (orgId: OrgId) =>
      request({ method: "GET", path: `${org(orgId)}/plans`, schema: PlanListResponseSchema }),
    customers: (orgId: OrgId, args: { search: string | null; cursor: string | null }) =>
      request({
        method: "GET",
        path: `${org(orgId)}/customers`,
        query: args,
        schema: CustomerPageSchema,
      }),
    customer: (orgId: OrgId, customerId: string) =>
      request({
        method: "GET",
        path: `${org(orgId)}/customers/${encodeURIComponent(customerId)}`,
        schema: CustomerDetailSchema,
      }),

    notificationSettings: () =>
      request({
        method: "GET",
        path: "/v1/settings/notifications",
        schema: NotificationSettingsResponseSchema,
      }),
    updateNotificationSettings: (body: UpdateNotificationSettingsRequest) =>
      request({
        method: "PUT",
        path: "/v1/settings/notifications",
        body,
        schema: NotificationSettingsResponseSchema,
      }),
    registerDevice: (body: RegisterDeviceRequest) =>
      request({ method: "POST", path: "/v1/devices", body, schema: OkResponseSchema }),
    unregisterDevice: (body: UnregisterDeviceRequest) =>
      request({ method: "DELETE", path: "/v1/devices", body, schema: OkResponseSchema }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
