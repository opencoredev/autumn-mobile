# Autumn Mobile Worker

The Worker exposes the mobile API under `/v1` and receives Autumn Svix webhooks at `/webhooks/autumn/:webhookId`. It stores only provider subjects and display names; customer email is never persisted. Secret Autumn keys and webhook signing secrets are AES-256-GCM encrypted with a random IV and row-bound AAD (`userId:orgId:purpose`). The full key is decrypted only while proxying a read-only Autumn request. Cloudflare Secrets Store is not used because Worker bindings can read account-level secrets created out of band, but cannot write per-user values at runtime.

Create infrastructure with `wrangler d1 create autumn-mobile` and `wrangler kv namespace create CACHE`. Replace placeholder IDs in `wrangler.jsonc`. Generate and store the encryption secret with `openssl rand -base64 32` followed by `wrangler secret put KEY_ENCRYPTION_KEY`; optionally set `wrangler secret put EXPO_ACCESS_TOKEN`. Configure `GOOGLE_CLIENT_IDS`, `APPLE_AUDIENCES`, and `PUBLIC_BASE_URL` as vars. Configure Autumn webhook events `billing.updated` and `invoice.finalized`, copy the `whsec_...` signing secret into the app, and use the generated webhook URL.

Local development uses `.dev.vars` (copy `.dev.vars.example`) and `wrangler d1 migrations apply autumn-mobile --local`.
