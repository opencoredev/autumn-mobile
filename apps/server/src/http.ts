import type { ErrorCode } from "@autumn/shared";
export function errorStatus(code: ErrorCode): number {
  if (code === "unauthorized") return 401;
  if (code === "not_found") return 404;
  if (code === "autumn_unavailable") return 503;
  return 400;
}
export function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } } satisfies { error: { code: ErrorCode; message: string } };
}
