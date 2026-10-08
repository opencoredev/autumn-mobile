import { Hono } from "hono";
import { cors } from "hono/cors";
import type { HealthResponse } from "@autumn/shared";
import type { AppEnv, Deps } from "./env";
import { errorResponse, HttpError } from "./http";
import { remoteIdentityVerifier } from "./identity";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { dashboardRoutes } from "./routes/dashboard";
import { orgRoutes } from "./routes/orgs";
import { webhookRoutes } from "./routes/webhooks";
import { bearerToken, userForToken } from "./sessions";

export function createApp(overrides: Partial<Deps> = {}) {
  const deps: Deps = {
    fetch: overrides.fetch ?? ((input, init) => fetch(input, init)),
    verifyIdentity: overrides.verifyIdentity ?? remoteIdentityVerifier(),
    now: overrides.now ?? (() => Date.now()),
  };

  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  // The app sends a bearer token, never cookies, so any origin is fine (web dev builds).
  app.use(
    "/v1/*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.use("/v1/*", async (c, next) => {
    if (c.req.path.startsWith("/v1/auth/")) return next();
    const token = bearerToken(c.req.header("authorization"));
    const user = token ? await userForToken(c.env.DB, { token, now: deps.now() }) : null;
    if (!user) return errorResponse(c, "unauthorized", "Sign in again.");
    c.set("user", user);
    return next();
  });

  app.get("/health", (c) => {
    const body: HealthResponse = { status: "ok" };
    return c.json(body);
  });
  app.route("/v1/auth", authRoutes);
  app.route("/v1", accountRoutes);
  app.route("/v1/orgs", orgRoutes);
  app.route("/v1/orgs", dashboardRoutes);
  app.route("/webhooks", webhookRoutes);

  app.notFound((c) => errorResponse(c, "not_found", "Not found."));
  app.onError((error, c) => {
    if (error instanceof HttpError) return errorResponse(c, error.code, error.message);
    // Never echo internal errors: they could include request data.
    return errorResponse(c, "internal", "Something went wrong.");
  });

  return app;
}
