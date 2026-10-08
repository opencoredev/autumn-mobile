// Signs and sends an Autumn-style webhook to the local Worker.
//
//   bun scripts/send-test-webhook.ts <webhook-url> <whsec_secret> <billing|renewal|unknown> [svix-id] [--bad]
//
// Prints the HTTP status. `--bad` signs with a different secret.
import { randomWebhookSecret, signSvix } from "../test/svix";

const [url, secret, kind = "billing", id = `msg_${crypto.randomUUID()}`] = process.argv.slice(2);
if (!url || !secret) {
  console.error(
    "usage: send-test-webhook.ts <url> <secret> [billing|renewal|unknown] [id] [--bad]",
  );
  process.exit(2);
}
const now = Date.now();
const payloads = {
  billing: {
    type: "billing.updated",
    data: {
      object: "billing.updated",
      customer_id: "cus_demo_2",
      plan_changes: [
        {
          action: "activated",
          subscription: {
            plan_id: "team",
            status: "active",
            past_due: false,
            started_at: now,
            canceled_at: null,
            expires_at: null,
            trial_ends_at: null,
            current_period_start: now,
            current_period_end: now,
          },
          previous_attributes: null,
          item_changes: [],
        },
      ],
      tags: [],
    },
  },
  renewal: {
    type: "invoice.finalized",
    data: {
      id: "inv_smoke_renewal",
      customer_id: "cus_demo_3",
      entity_id: null,
      plan_ids: ["pro"],
      stripe_id: "in_smoke",
      processor_type: "stripe",
      status: "paid",
      total: 29,
      amount_paid: 29,
      refunded_amount: 0,
      currency: "usd",
      created_at: now,
      hosted_invoice_url: null,
      items: [],
    },
  },
  unknown: {
    type: "balances.limit_reached",
    data: { customer_id: "cus_demo_1", feature_id: "api", limit_type: "included" },
  },
};
const payload =
  kind === "renewal" ? payloads.renewal : kind === "unknown" ? payloads.unknown : payloads.billing;
const body = JSON.stringify(payload);
const timestamp = Math.floor(now / 1000);
const signingSecret = process.argv.includes("--bad") ? randomWebhookSecret() : secret;
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": await signSvix({ secret: signingSecret, id, timestamp, body }),
  },
  body,
});
console.log(response.status);
