const secret = process.argv[2] || "whsec_" + btoa("demo-secret");
const url = process.argv[3] || "http://localhost:8787/webhooks/autumn/demo";
const id = "msg_test_1",
  timestamp = String(Math.floor(Date.now() / 1000));
const body = JSON.stringify({
  type: "billing.updated",
  data: {
    customer_id: "cus_demo_1",
    plan_changes: [
      {
        action: "activated",
        subscription: { plan_id: "pro", status: "active", trial_ends_at: null },
      },
    ],
    tags: [],
  },
});
const key = await crypto.subtle.importKey(
  "raw",
  Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const mac = await crypto.subtle.sign(
  "HMAC",
  key,
  new TextEncoder().encode(`${id}.${timestamp}.${body}`),
);
const sig = btoa(String.fromCharCode(...new Uint8Array(mac)));
const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sig}`,
  },
  body,
});
console.log(response.status, await response.text());
