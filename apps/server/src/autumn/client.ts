import type { z } from "zod";
import { HttpError } from "../http";
import {
  AUTUMN_API_VERSION,
  CustomerRaw,
  InvoiceRaw,
  ListEnvelope,
  PlanRaw,
  PurchaseRaw,
  SubscriptionRaw,
  parseRows,
} from "./schemas";

/**
 * The only Autumn endpoints this Worker may call. All are reads, even though
 * Autumn's API uses POST for them. Anything else is refused before any I/O.
 */
export const READ_ONLY_AUTUMN_PATHS = [
  "/v1/invoices.list",
  "/v1/subscriptions.list",
  "/v1/purchases.list",
  "/v1/customers.list",
  "/v1/customers.get",
  "/v1/plans.list",
] as const;
export type ReadOnlyAutumnPath = (typeof READ_ONLY_AUTUMN_PATHS)[number];

export function isReadOnlyAutumnPath(path: string): path is ReadOnlyAutumnPath {
  return READ_ONLY_AUTUMN_PATHS.some((allowed) => allowed === path);
}

export type ListPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

type SubscriptionStatusFilter = "active" | "scheduled" | "past_due" | "expired";

export function createAutumnClient(args: {
  baseUrl: string;
  secretKey: string;
  fetch: typeof fetch;
}) {
  const base = args.baseUrl.replace(/\/$/, "");

  async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
    if (!isReadOnlyAutumnPath(path)) {
      throw new HttpError("internal", "Refused a non read-only Autumn call.");
    }
    let response: Response;
    try {
      response = await args.fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${args.secretKey}`,
          "content-type": "application/json",
          "x-api-version": AUTUMN_API_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpError("autumn_unavailable", "Couldn't reach Autumn.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new HttpError("invalid_autumn_key", "Autumn rejected the secret key.");
    }
    if (response.status === 404) throw new HttpError("not_found", "Autumn has no such record.");
    if (!response.ok) {
      throw new HttpError("autumn_unavailable", `Autumn answered with status ${response.status}.`);
    }
    return response.json().catch(() => {
      throw new HttpError("autumn_unavailable", "Autumn sent a response that isn't JSON.");
    });
  }

  async function list<S extends z.ZodType>(
    path: ReadOnlyAutumnPath,
    schema: S,
    body: Record<string, unknown>,
  ): Promise<ListPage<z.infer<S>>> {
    const envelope = ListEnvelope.safeParse(await post(path, body));
    if (!envelope.success) {
      throw new HttpError("autumn_unavailable", "Autumn sent an unexpected list response.");
    }
    return {
      items: parseRows(schema, envelope.data.list),
      nextCursor: envelope.data.next_cursor,
      hasMore: envelope.data.has_more ?? envelope.data.next_cursor !== null,
    };
  }

  const cursor = (value: string | null | undefined) => (value ? { start_cursor: value } : {});

  return {
    post,
    listPlans: async () =>
      (await list("/v1/plans.list", PlanRaw, { include_archived: false })).items,
    listInvoices: (params: {
      cursor?: string | null;
      limit?: number;
      status?: ("draft" | "open" | "void" | "paid" | "uncollectible")[];
      invoiceId?: string;
      customerId?: string;
    }) =>
      list("/v1/invoices.list", InvoiceRaw, {
        ...cursor(params.cursor),
        limit: params.limit ?? 50,
        ...(params.status ? { status: params.status } : {}),
        ...(params.invoiceId ? { invoice_id: params.invoiceId } : {}),
        ...(params.customerId ? { customer_id: params.customerId } : {}),
      }),
    listSubscriptions: (params: {
      cursor?: string | null;
      limit?: number;
      statuses?: SubscriptionStatusFilter[];
      customerId?: string;
      planId?: string;
    }) =>
      list("/v1/subscriptions.list", SubscriptionRaw, {
        ...cursor(params.cursor),
        limit: params.limit ?? 50,
        ...(params.statuses ? { statuses: params.statuses } : {}),
        ...(params.customerId ? { customer_id: params.customerId } : {}),
        ...(params.planId ? { plan_id: params.planId } : {}),
      }),
    listPurchases: (params: { cursor?: string | null; limit?: number }) =>
      list("/v1/purchases.list", PurchaseRaw, {
        ...cursor(params.cursor),
        limit: params.limit ?? 50,
        statuses: ["active", "scheduled", "expired"],
      }),
    listCustomers: (params: { cursor?: string | null; limit?: number; search?: string | null }) =>
      list("/v1/customers.list", CustomerRaw, {
        ...cursor(params.cursor),
        limit: params.limit ?? 50,
        sort_order: "desc",
        ...(params.search ? { search: params.search } : {}),
      }),
    getCustomer: async (customerId: string): Promise<CustomerRaw> => {
      const parsed = CustomerRaw.safeParse(
        await post("/v1/customers.get", {
          customer_id: customerId,
          expand: ["invoices", "balances.feature", "payment_method"],
        }),
      );
      if (!parsed.success) throw new HttpError("not_found", "Customer not found.");
      return parsed.data;
    },
  };
}

export type AutumnClient = ReturnType<typeof createAutumnClient>;

/**
 * Follows a subscriptions/purchases cursor until it has rows or runs out.
 * Autumn may return empty pages while `has_more` is true.
 */
export async function firstNonEmptyPage<T>(args: {
  cursor: string | null;
  fetchPage: (cursor: string | null) => Promise<ListPage<T>>;
  maxPages?: number;
}): Promise<{ items: T[]; nextCursor: string | null }> {
  let cursor = args.cursor;
  for (let page = 0; page < (args.maxPages ?? 5); page += 1) {
    const result = await args.fetchPage(cursor);
    const next = result.hasMore ? result.nextCursor : null;
    if (result.items.length > 0 || next === null) return { items: result.items, nextCursor: next };
    cursor = next;
  }
  return { items: [], nextCursor: cursor };
}
