# Autumn Mobile

An unofficial mobile dashboard for [Autumn](https://useautumn.com) billing, in the spirit of Polar's mobile app. It shows 30-day revenue, subscriptions, orders, plans and customers for one or more Autumn organizations, and plays a cha-ching on your phone when someone pays.

This project is not made, endorsed or supported by Autumn or Polar.

| Workspace         | What it is                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile`     | Expo SDK 57 app (Expo Router, TypeScript strict). iOS and Android; web is a local dev surface only.                                                                                                        |
| `apps/server`     | Hono on Cloudflare Workers with D1 and KV. Holds the encrypted Autumn keys, proxies every Autumn call, verifies Autumn webhooks and sends Expo pushes. See [apps/server/README.md](apps/server/README.md). |
| `packages/shared` | Zod contracts for every request and response, a typed API client, and money formatting. Both apps import it.                                                                                               |

## How it fits together

```
phone ──HTTPS + session token──▶ Worker ──secret key (decrypted per request)──▶ Autumn API (read-only)
                                   ▲
Autumn webhook (Svix-signed) ──────┘──▶ Expo push ──▶ every device of that user
```

The phone never talks to Autumn and never holds an Autumn key. You paste a secret key once; the app sends it to the Worker, which checks it with a read-only `plans.list` call, encrypts it, and from then on only reports the last four characters.

## Commands

Requires Bun 1.4+ and Node.js 24+.

```sh
bun install          # install workspace dependencies
bun dev              # Metro and the Worker together
bun mobile           # Expo only
bun server           # Wrangler only
bun run typecheck    # every workspace
bun run lint         # oxlint
bun run format:check # oxfmt
bun run test         # Worker tests (vitest, max 4 workers)
bun run build        # Worker dry-run bundle and Expo export (iOS, Android, web)
```

## Where secrets live, and why

| Secret                         | Stored where                                                                                                 | Why                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Autumn secret keys             | D1, AES-256-GCM encrypted with a random IV per write and the row's `userId:orgId:purpose` as associated data | Each user adds their own keys at runtime.        |
| Autumn webhook signing secrets | Same as keys                                                                                                 | Needed to verify Svix signatures per org.        |
| `KEY_ENCRYPTION_KEY`           | Worker secret (`wrangler secret put`)                                                                        | The one master key; never in D1, KV or git.      |
| Session token                  | iOS Keychain / Android Keystore via `expo-secure-store` on the phone; only a SHA-256 hash in D1              | A stolen database can't be replayed as sessions. |

Cloudflare Secrets Store was considered and rejected. Workers can only read Secrets Store values through bindings; secrets are created out of band per account (dashboard, Wrangler or the API with an account token), so a Worker can't write a new per-user secret when someone pastes a key. Encrypting in D1 with a master key held as a Worker secret gives the same "key never at rest in plaintext" property and works for any number of users. Rotation is supported through the `key_version` column.

If you sign in with Google on one device and Apple on another using the same verified email, you get one account with the same orgs and settings. The Worker stores only a keyed hash of the email, never the address.

The Worker never logs keys, signing secrets, ID tokens or session tokens, and the Autumn client refuses any path other than the six read endpoints it needs.

## The mobile app

Screens: sign-in (Google on both platforms, Apple on iOS only; the Apple button is not rendered on Android), onboarding, Home (revenue total, scrubbable 30-day chart, active and trialing counts, recent subscriptions, recent orders), Customers with search, Catalogue, customer, order and plan detail, Subscriptions and Orders lists, Settings (push toggles, organizations, account), organization management (rename, replace key, remove), the webhook setup flow, an org switcher sheet, and About.

Data comes through react-query with an AsyncStorage persister, so every screen opens instantly from cache and refreshes in the background. Pull to refresh works everywhere; loading states are skeletons shaped like the rows they replace.

### Notifications

Autumn sends `billing.updated` and `invoice.finalized` to a per-org webhook URL on the Worker. The Worker verifies the Svix signature with that org's signing secret, decides what kind of event it is, applies your settings, and sends an Expo push to every device you're signed in on.

| Setting                    | Default | Fires on                                                                                  |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Push notifications         | On      | Master switch                                                                             |
| New one-time purchases     | On      | A one-off plan is activated                                                               |
| New subscriptions          | On      | A paid recurring plan starts, or a trial converts                                         |
| New trials                 | On      | A recurring plan starts with a trial end in the future                                    |
| Subscription renewals      | Off     | A non-first invoice for a recurring plan is finalized                                     |
| Subscription cancellations | Off     | `canceled_at` goes from empty to set                                                      |
| Exclude free products      | Off     | Skips subscription, trial, renewal and cancellation pushes for free plans (not purchases) |

Settings are stored on the server, so they follow you to every device.

Pushes read like `New subscription · $29 Pro`, with the customer and org name in the body. iOS groups them by org (`threadId`), Android gives each org its own channel. Tapping one opens that customer or order in the app. While the app is open you get an in-app toast with a pixel confetti burst, a success haptic and the cha-ching instead of a system banner.

The cha-ching sound and all icons are generated from scratch by `apps/mobile/scripts/generate_assets.py` and released under CC0.

## Run it locally without any accounts

The Worker has a dev sign-in and the repo ships a mock Autumn, so you can click through the whole app before creating any OAuth clients.

1. Start the mock Autumn and the Worker (see [apps/server/README.md](apps/server/README.md#local-development)). `bash apps/server/scripts/smoke.sh` does all of this and exercises every route.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set `EXPO_PUBLIC_DEV_LOGIN=true` and `EXPO_PUBLIC_API_URL` to the Worker URL.
3. `bun mobile`, then press `w` for the browser, or run a development build on a device.
4. Choose "Continue with dev account", add an org with the mock's fake key, and look around.

Push notifications, Google and Apple sign-in need a development build on a real device; they don't run in a browser or Expo Go.

## Setup before a device test or deploy

Nothing below has been done. Each step needs your accounts.

### 1. Cloudflare (Worker)

```sh
cd apps/server
bunx wrangler d1 create autumn-mobile            # paste database_id into wrangler.jsonc
bunx wrangler kv namespace create CACHE          # paste id into wrangler.jsonc
bunx wrangler d1 migrations apply autumn-mobile --remote
openssl rand -base64 32 | bunx wrangler secret put KEY_ENCRYPTION_KEY
bunx wrangler secret put EXPO_ACCESS_TOKEN       # optional, see step 4
```

Then set these `vars` in `wrangler.jsonc`: `PUBLIC_BASE_URL` (the Worker's public URL, used to build webhook URLs), `GOOGLE_CLIENT_IDS` (comma-separated: web, iOS and Android client IDs) and `APPLE_AUDIENCES` (your iOS bundle ID). Deploy with `bunx wrangler deploy`. Keep `ALLOW_DEV_LOGIN` out of production; it only belongs in `.dev.vars`.

### 2. Google sign-in

In Google Cloud console create OAuth client IDs of type Web, iOS (bundle ID) and Android (package name plus your signing SHA-1). Put the web client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, the iOS one in `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, its reversed form in `GOOGLE_IOS_URL_SCHEME`, and all three in the Worker's `GOOGLE_CLIENT_IDS`. Replace the placeholder "G" mark on the sign-in screen with Google's official asset before store review.

### 3. Sign in with Apple

Enable the Sign in with Apple capability for your bundle ID in the Apple Developer portal. Set `APP_BUNDLE_ID` for the app and the same value in the Worker's `APPLE_AUDIENCES`.

### 4. EAS and push credentials

```sh
cd apps/mobile
bunx eas init                      # creates the EAS project; put its ID in EAS_PROJECT_ID
bunx eas credentials               # APNs key for iOS, FCM v1 service account for Android
bunx eas build --profile development --platform ios   # or android
```

If you turn on enhanced push security in Expo, create an access token and store it as the Worker's `EXPO_ACCESS_TOKEN`.

### 5. Autumn webhook (per org, in the app)

In the app open Settings → your org → Webhook setup and follow the four steps: copy the webhook URL, add it in Autumn under Developer → Webhooks with the `billing.updated` and `invoice.finalized` events, paste the endpoint's `whsec_` signing secret into the app, and send a test.

## Repository notes

- Everything here is local; there is no remote and nothing has been deployed.
- No email addresses appear in code, tests, fixtures or docs. The Worker never reads or stores the email claim from Google or Apple tokens.
