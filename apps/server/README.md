# Autumn Mobile Worker

The backend for the Autumn Mobile app. It runs on Cloudflare Workers with Hono, stores data in D1, caches in KV, and is the only thing that ever talks to Autumn. It:

- signs users in with Google or Apple ID tokens and issues its own sessions,
- stores each org's Autumn secret key encrypted, and proxies read-only Autumn calls with it,
- builds the dashboard aggregates (30-day revenue from invoices, subscription counts),
- receives Autumn webhooks, verifies them, and sends Expo pushes.

Request and response bodies are defined once in `packages/shared/src/contracts.ts`; handlers parse requests with those schemas and type their responses with them.

## Routes

All `/v1` routes except `/v1/auth/*` need `Authorization: Bearer <session token>`.

| Method and path                                        | Purpose                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `POST /v1/auth/google`                                 | Verify a Google ID token, return a session                            |
| `POST /v1/auth/apple`                                  | Verify an Apple identity token, return a session                      |
| `POST /v1/auth/dev`                                    | Local only: session for a dev user. 404 unless `ALLOW_DEV_LOGIN=true` |
| `POST /v1/auth/logout`                                 | Revoke the current session                                            |
| `GET /v1/me`                                           | Current user                                                          |
| `GET /v1/orgs`, `POST /v1/orgs`                        | List orgs; add one (validates the key with `plans.list` first)        |
| `PATCH /v1/orgs/:orgId`                                | Rename                                                                |
| `PUT /v1/orgs/:orgId/key`                              | Replace the secret key (validated the same way)                       |
| `PUT /v1/orgs/:orgId/webhook-secret`                   | Save the Autumn webhook signing secret                                |
| `DELETE /v1/orgs/:orgId`                               | Remove the org from this app (nothing changes in Autumn)              |
| `POST /v1/orgs/:orgId/test-push`                       | Send a test notification to your devices                              |
| `GET /v1/orgs/:orgId/overview`                         | Revenue summary, subscription counts, recent subscriptions and orders |
| `GET /v1/orgs/:orgId/subscriptions`                    | Paged subscriptions (`?cursor=`)                                      |
| `GET /v1/orgs/:orgId/purchases`                        | Paged one-off purchases                                               |
| `GET /v1/orgs/:orgId/invoices`, `/invoices/:invoiceId` | Paged invoices; one invoice                                           |
| `GET /v1/orgs/:orgId/plans`                            | Plans with price, trial and free flag                                 |
| `GET /v1/orgs/:orgId/customers`                        | Paged customers (`?search=` matches name or id)                       |
| `GET /v1/orgs/:orgId/customers/:customerId`            | Customer with subscriptions, purchases, invoices and lifetime value   |
| `GET`/`PUT /v1/settings/notifications`                 | Notification settings (PUT takes a partial update)                    |
| `POST`/`DELETE /v1/devices`                            | Register or remove an Expo push token                                 |
| `POST /webhooks/autumn/:webhookId`                     | Autumn webhook receiver (public, Svix-signed)                         |
| `GET /health`                                          | Liveness                                                              |

Another user's org always answers 404, never 403, so org ids can't be probed.

## Calling Autumn

`src/autumn/client.ts` is the only Autumn client. It may call six endpoints, all reads: `invoices.list`, `subscriptions.list`, `purchases.list`, `customers.list`, `customers.get` and `plans.list` (Autumn uses `POST` for them). Any other path is refused before a request is made, and a test checks that. Requests send `x-api-version: 2.5.0`. Responses are parsed with zod; a malformed row is dropped rather than failing the whole list. Autumn's 401/403 becomes `invalid_autumn_key`, 404 becomes `not_found`, anything else becomes `autumn_unavailable`.

Customer `email` and free-form `metadata` fields are never parsed, stored or returned; metadata can hold anything, including personal data.

## Secrets

Autumn secret keys and webhook signing secrets are encrypted with AES-256-GCM before they reach D1 (`src/secrets.ts`):

- The master key is `KEY_ENCRYPTION_KEY`, a Worker secret. It must decode to exactly 32 bytes (AES-256); anything else fails loudly instead of silently using a weaker key. It is never in D1, KV, the repo or logs.
- Every encryption uses a fresh random 12-byte IV.
- The associated data is `userId:orgId:purpose`, so a ciphertext copied to another row, user or purpose fails to decrypt.
- `key_version` on each org row records which master key sealed it, for rotation.
- Keys are decrypted only inside a request that needs to call Autumn. Responses expose only the last four characters (the masked suffix the app shows, also stored in plaintext for that purpose) and whether the key is live or sandbox.

**Why not Cloudflare Secrets Store?** Workers read Secrets Store values through bindings, and secrets are created out of band (dashboard, Wrangler, or the API with an account token). A Worker can't create a secret at runtime when a user pastes a key, and per-user secrets don't fit an account-level store. Encrypting in D1 under one master key held as a Worker secret gives the same property, no plaintext keys at rest, for any number of users.

Google and Apple sign-ins that share a provider-verified email become one account, whichever comes first. The Worker never stores the email: it keeps an HMAC of the lowercased address, keyed by an HKDF-derived key from `KEY_ENCRYPTION_KEY`, in the `identities` table and compares hashes. Unverified emails and Apple "Hide My Email" relay addresses never link. Rotating `KEY_ENCRYPTION_KEY` changes the hashes, so existing accounts keep working but won't auto-link to a new provider afterward.

Sessions are 32 random bytes. D1 stores only their SHA-256 hash; they expire after 60 days and logout deletes them. The Worker never logs keys, secrets, ID tokens or session tokens, and its error handler never echoes internal errors.

## Revenue

Autumn has no revenue endpoint, so the overview sums invoices (`src/revenue.ts`). It pages through every invoice (1,000 per page, up to 20 pages) because Autumn doesn't document the list order; the same pass gives the ten newest orders. For each paid invoice created in the last 30 UTC days it adds `amount_paid − refunded_amount`, falling back to `total` when `amount_paid` is null, which is the realized-revenue formula from Autumn's own docs. Amounts are in major units. Results are grouped per currency (largest first), every day is zero-filled, and `truncated: true` means the page cap was hit. Revenue and recent orders are cached in KV for 5 minutes and cleared whenever a verified webhook arrives for the org, so a new sale shows up on the next refresh. Plans are cached for 10 minutes, customer names for 5.

Active and trialing counts read every live subscription (Autumn's `active` status, which includes trials, pending cancellations and past-due plans), 200 per call, in the same cached pass. The page limits (100 pages of invoices, 500 of subscriptions) are safety stops far above real orgs; if one is ever hit the response says so and the app shows the count as `N+`. Every page is a Cloudflare subrequest: the Free plan allows 50 per request, enough for roughly 5,000 subscriptions alongside revenue; the Paid plan allows 10,000.

Plans don't carry a currency in Autumn's API, so plan prices are shown in the org's main revenue currency, defaulting to USD.

## Webhooks and notifications

Each org gets an unguessable webhook URL. A request is processed only if:

1. the org has a saved signing secret,
2. `svix-id`, `svix-timestamp` and `svix-signature` are present,
3. one of the `v1,` signatures matches HMAC-SHA256 over `id.timestamp.body` with the base64-decoded secret (constant-time compare), and
4. the timestamp is within 5 minutes.

The `svix-id` is recorded per org, so a retried delivery never pushes twice. If building the push fails, or Expo accepts none of it (outage, non-2xx, unreadable reply), the claim is released and the Worker returns an error so Svix retries. A partial Expo failure is not retried, because that would repeat the pushes that did go out.

`src/notifications.ts` decides what to send, as a pure function of the event, the org's plans and the user's settings:

| Kind         | Trigger                                                                                                                        | Setting (default)                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Purchase     | `billing.updated`, `activated` with a `purchase`                                                                               | New one-time purchases (on)      |
| Subscription | `activated` subscription without a future trial end, or `updated` with the `trial_ended` tag while active                      | New subscriptions (on)           |
| Trial        | `activated` subscription whose trial ends in the future                                                                        | New trials (on)                  |
| Renewal      | `invoice.finalized` with a positive total for a recurring plan whose subscription started more than an hour before the invoice | Subscription renewals (off)      |
| Cancellation | `updated` where `previous_attributes.canceled_at` was null and is now set                                                      | Subscription cancellations (off) |

The master Push switch silences everything. "Exclude free products" (off by default) drops subscription, trial, renewal and cancellation pushes for plans with no charge, but never purchases. Other event types are acknowledged and ignored.

Titles read like `New subscription · $29 Pro` or `Renewal · $31.50 Pro`; the body is `<customer> · <org>`. Each Expo message carries `sound: "cha_ching.wav"`, `channelId` and `threadId` of `org-<orgId>` (Android channel, iOS grouping), and a `data` payload the app uses to open the customer or order. Tokens Expo reports as `DeviceNotRegistered` are deleted.

## Local development

```sh
cp .dev.vars.example .dev.vars        # then fill KEY_ENCRYPTION_KEY with: openssl rand -base64 32
bunx wrangler d1 migrations apply autumn-mobile --local
MOCK_AUTUMN_KEY=am_sk_test_local_dev bun run mock   # fake Autumn + Expo on :8789
bun run dev                                        # Worker on :8787
```

Sign in with `curl -X POST localhost:8787/v1/auth/dev`, then add an org with the `MOCK_AUTUMN_KEY` value as its secret key. `GET localhost:8789/mock/pushes` shows the pushes the Worker sent. `bun scripts/send-test-webhook.ts <webhookUrl> <whsec_…> billing` signs and sends a sample event.

The mock and the tests share one fake (`test/fake-autumn.ts`) with invented companies and no email fields. It returns invoices oldest first on purpose, so nothing depends on an undocumented sort order.

## Tests

```sh
bun run test     # vitest, max 4 workers
bun run smoke    # real wrangler dev against the mock; prints PASS/FAIL per check
```

The unit tests cover encryption, Svix verification, revenue summing and pagination, notification classification and filtering, push batching, the Autumn client and the mappers. `test/routes.test.ts` runs the whole app against real local D1 and KV (wrangler's `getPlatformProxy`), the fake Autumn, and a local RSA key standing in for Google and Apple. It checks sign-in, org isolation, that keys and webhook secrets never appear in any response or in the database, every read route against the shared schemas, settings, devices and the webhook-to-push path.

`smoke.sh` uses a temporary state directory and throwaway secrets passed with `--env-file`; it doesn't touch `.dev.vars`.

## Deploying

These steps need your Cloudflare account; none of them have been run.

```sh
bunx wrangler d1 create autumn-mobile                  # put database_id in wrangler.jsonc
bunx wrangler kv namespace create CACHE                # put the id in wrangler.jsonc
bunx wrangler d1 migrations apply autumn-mobile --remote
openssl rand -base64 32 | bunx wrangler secret put KEY_ENCRYPTION_KEY
bunx wrangler secret put EXPO_ACCESS_TOKEN             # optional
```

In `wrangler.jsonc` set `PUBLIC_BASE_URL` to the Worker's public URL, `GOOGLE_CLIENT_IDS` to your Google web, iOS and Android client IDs (comma-separated), and `APPLE_AUDIENCES` to your iOS bundle ID. Then `bunx wrangler deploy`. Don't set `ALLOW_DEV_LOGIN` in production.

Keep a copy of `KEY_ENCRYPTION_KEY` somewhere safe. Without it the stored keys can't be decrypted and every org would need its key re-entered.

## Connecting Autumn

For each org, in the Autumn dashboard go to Developer → Webhooks → Add Endpoint, paste the org's webhook URL (the app shows it under Settings → org → Webhook setup), subscribe to `billing.updated` and `invoice.finalized`, then copy the endpoint's `whsec_…` signing secret into the app.
