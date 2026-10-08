import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ErrorBody, ErrorCode } from "@autumn/shared";
import type { AppEnv } from "./env";

/** Thrown anywhere in a handler; `app.onError` turns it into an ErrorBody. */
export class HttpError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
  }
}

export function statusFor(code: ErrorCode): ContentfulStatusCode {
  switch (code) {
    case "unauthorized":
      return 401;
    case "not_found":
      return 404;
    case "invalid_request":
    case "invalid_autumn_key":
    case "invalid_signature":
      return 400;
    case "autumn_unavailable":
      return 502;
    case "internal":
      return 500;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function errorResponse(c: Context<AppEnv>, code: ErrorCode, message: string): Response {
  const body: ErrorBody = { error: { code, message } };
  return c.json(body, statusFor(code));
}

/** Parses the JSON body with a shared contract schema or throws `invalid_request`. */
export async function readJson<S extends z.ZodType>(
  c: Context<AppEnv>,
  schema: S,
): Promise<z.infer<S>> {
  const raw: unknown = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError("invalid_request", "Request body is invalid.");
  return parsed.data;
}

/** Route params are always present for matched routes; this keeps the type honest. */
export function param(c: Context<AppEnv>, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new HttpError("invalid_request", `Missing ${name}.`);
  return value;
}
