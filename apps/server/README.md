# Autumn Mobile Worker

This Cloudflare Worker is the server boundary for the Autumn Mobile app. It authenticates Google, Apple, and development sessions, stores organizations and notification preferences in D1, proxies read-only Autumn billing data, and turns verified Autumn webhooks into Expo push notifications.

## Routes

| Route                                                                 | Purpose                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POST /v1/auth/google`, `/v1/auth/apple`, `/v1/auth/dev`              | Start a session (`/dev` requires `ALLOW_DEV_LOGIN=true`).          |
| `POST /v1/auth/logout`, `GET /v1/me`                                  | Revoke a session and read the current user.                        |
| `GET/POST /v1/orgs`, `PATCH/PUT/DELETE /v1/orgs/:id`                  | Manage organizations, Autumn keys, and webhook secrets.            |
| `GET /v1/orgs/:id/overview`                                           | Revenue, subscriptions, and recent orders.                         |
| `GET /v1/orgs/:id/{subscriptions,purchases,invoices,plans,customers}` | Read billing lists; customer and invoice detail use nested routes. |
| `GET/PUT /v1/settings/notifications`                                  | Read and update notification filters.                              |
| `POST/DELETE /v1/devices`                                             | Register or remove an Expo token.                                  |
| `POST /v1/orgs/:id/test-push`                                         | Send a test notification.                                          |
| `POST /webhooks/autumn/:webhookId`                                    | Verify Svix and process Autumn events.                             |

## Secret storage

Autumn keys and Svix signing secrets are encrypted with AES-256-GCM using a random 12-byte IV. Additional authenticated data binds each row to its user, organization, and purpose. D1 stores the ciphertext, IV, and `key_version` so future key rotation can be explicit. `KEY_ENCRYPTION_KEY` is a Worker secret. The full values never appear in API responses, logs, or D1 plaintext.

Cloudflare Secrets Store is not used for these values. Its bindings read account-level secrets created out of band; they do not support runtime per-user writes, and each store has a per-store secret count limit. D1 is the per-organization encrypted store here.

## Local development

From the repository root, install dependencies with `bun install`. Create `apps/server/.dev.vars` with a base64 32-byte `KEY_ENCRYPTION_KEY`, then run:

```sh
bunx wrangler d1 migrations apply autumn-mobile --local
bunx wrangler dev --local --port 8787
```

Set `AUTUMN_API_BASE=http://127.0.0.1:8789` and run `bun apps/server/scripts/mock-autumn.ts` in a second shell for local billing data. The mock accepts only `am_sk_test_demo_key`.

## Tests and smoke test

Run the bounded suite with `timeout 600 bunx vitest run --maxWorkers=4`. The end-to-end script is `bash apps/server/scripts/smoke.sh`; it creates an isolated Wrangler persist directory, starts both local servers, checks every route, and removes its child processes on exit. The test suite covers encryption, revenue grouping, notification classification, and route contracts.

## Deploying

Leo performs deployment setup manually:

```sh
wrangler d1 create autumn-mobile
wrangler kv namespace create CACHE
# replace database and KV IDs in wrangler.jsonc
wrangler d1 migrations apply autumn-mobile --remote
openssl rand -base64 32 | wrangler secret put KEY_ENCRYPTION_KEY
wrangler secret put EXPO_ACCESS_TOKEN # optional
```

Set `GOOGLE_CLIENT_IDS`, `APPLE_AUDIENCES`, and `PUBLIC_BASE_URL` as Worker variables. Configure Autumn webhook events `billing.updated` and `invoice.finalized`, then copy the resulting `whsec_...` value into the organization settings. No deploy or account mutation is performed by this repository's tests.

## Notification rules

Activated purchases create purchase notifications. Activated subscriptions with a future trial create trial notifications; other activations and `trial_ended` updates create subscription notifications. A cancellation is an update that changes `canceled_at` from null to a timestamp. `invoice.finalized` is a renewal when it is not a one-off invoice and its `started_at` is more than one hour from the invoice time. Purchases, subscriptions, and trials are enabled by default; renewals and cancellations are disabled. `excludeFree` filters free-plan subscription, trial, renewal, and cancellation events while keeping purchases.
