import { Hono } from "hono";
import type { HealthResponse } from "@autumn/shared";

type Bindings = {
  // DB?: D1Database;
  // CACHE?: KVNamespace;
  // API_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => {
  const response: HealthResponse = { status: "ok" };
  return c.json(response);
});

export default app;
