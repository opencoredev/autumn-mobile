import { z } from "zod";
/** The Worker may call only these read-only Autumn endpoints. */
export const READ_ONLY_AUTUMN_PATHS = [
  "/v1/invoices.list",
  "/v1/subscriptions.list",
  "/v1/purchases.list",
  "/v1/customers.list",
  "/v1/customers.get",
  "/v1/plans.list",
] as const;
export type ReadOnlyAutumnPath = (typeof READ_ONLY_AUTUMN_PATHS)[number];
export const AutumnEnvelope = z
  .object({
    list: z.array(z.unknown()).default([]),
    next_cursor: z.string().nullable().optional(),
    has_more: z.boolean().optional(),
  })
  .passthrough();
export function assertReadOnlyPath(path: string): asserts path is ReadOnlyAutumnPath {
  if (!(READ_ONLY_AUTUMN_PATHS as readonly string[]).includes(path))
    throw new Error("autumn_path_not_allowed");
}
