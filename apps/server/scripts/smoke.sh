#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:8787}"
MOCK_URL="${MOCK_URL:-http://127.0.0.1:8789}"
PERSIST="$ROOT/apps/server/.wrangler/smoke"
VARS="$ROOT/apps/server/.dev.vars.smoke"
DEVVARS="$ROOT/apps/server/.dev.vars"
MOCK_LOG="$PERSIST/mock.log"
WORKER_LOG="$PERSIST/worker.log"
rm -rf "$PERSIST"; mkdir -p "$PERSIST"
SMOKE_KEY="$(openssl rand -base64 32 | tr '+/' 'AB' | tr -d '\n')"
printf 'KEY_ENCRYPTION_KEY=%s\nALLOW_DEV_LOGIN=true\nAUTUMN_API_BASE=%s\nPUBLIC_BASE_URL=%s\nEXPO_PUSH_URL=%s/mock/push\n' "$SMOKE_KEY" "$MOCK_URL" "$SERVER_URL" "$MOCK_URL" > "$VARS"
cp "$VARS" "$DEVVARS"
cleanup() { [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null || true; [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null || true; rm -f "$VARS" "$DEVVARS"; }
trap cleanup EXIT INT TERM
cd "$ROOT"
bun apps/server/scripts/mock-autumn.ts >"$MOCK_LOG" 2>&1 & MOCK_PID=$!
(cd apps/server && bunx wrangler d1 migrations apply autumn-mobile --local --persist-to "$PERSIST") >/dev/null
(cd apps/server && bunx wrangler dev --local --port 8787 --persist-to "$PERSIST") >"$WORKER_LOG" 2>&1 & WORKER_PID=$!
for _ in $(seq 1 60); do curl -fsS "$SERVER_URL/health" >/dev/null && break; sleep 0.5; done
curl -fsS "$SERVER_URL/health" >/dev/null && echo 'PASS health' || { echo 'FAIL health'; exit 1; }
json() { curl -sS --max-time 10 "$@"; }
status() { curl -sS -o /tmp/autumn-smoke-body -w '%{http_code}' --max-time 10 "$@"; }
TOKEN="$(json -X POST "$SERVER_URL/v1/auth/dev" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'content-type: application/json')
echo 'PASS dev login'
code=$(status "${AUTH[@]}" -X POST -d '{"name":"Smoke Org","secretKey":"am_sk_test_wrong"}' "$SERVER_URL/v1/orgs"); [[ "$code" == 400 ]] && echo 'PASS create bad key' || { echo 'FAIL create bad key'; exit 1; }
ORG_JSON="$(json "${AUTH[@]}" -X POST -d '{"name":"Smoke Org","secretKey":"am_sk_test_demo_key"}' "$SERVER_URL/v1/orgs")"
if ! printf '%s' "$ORG_JSON" | python3 -c 'import json,sys; assert "org" in json.load(sys.stdin)'; then echo "FAIL create good key: $ORG_JSON"; exit 1; fi
ORG_ID="$(printf '%s' "$ORG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["org"]["id"])')"
WEBHOOK_ID="$(printf '%s' "$ORG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["org"]["webhookUrl"].rsplit("/",1)[-1])')"
echo 'PASS create good key'
for path in "v1/orgs" "v1/orgs/$ORG_ID/overview" "v1/orgs/$ORG_ID/subscriptions" "v1/orgs/$ORG_ID/purchases" "v1/orgs/$ORG_ID/invoices" "v1/orgs/$ORG_ID/plans" "v1/orgs/$ORG_ID/customers"; do json "${AUTH[@]}" "$SERVER_URL/$path" >/dev/null; echo "PASS $path"; done
json "${AUTH[@]}" -X PATCH -d '{"name":"Renamed Smoke Org"}' "$SERVER_URL/v1/orgs/$ORG_ID" >/dev/null; echo 'PASS rename'
json "${AUTH[@]}" -X GET "$SERVER_URL/v1/orgs/$ORG_ID/customers?search=acme" >/dev/null; echo 'PASS customer search'
json "${AUTH[@]}" "$SERVER_URL/v1/orgs/$ORG_ID/customers/cus_demo_1" >/dev/null; echo 'PASS customer detail'
json "${AUTH[@]}" "$SERVER_URL/v1/orgs/$ORG_ID/invoices/in_demo_1" >/dev/null; echo 'PASS invoice detail'
code=$(status "${AUTH[@]}" "$SERVER_URL/v1/orgs/$ORG_ID/invoices/unknown"); [[ "$code" == 404 ]] && echo 'PASS invoice 404' || { echo 'FAIL invoice 404'; exit 1; }
json "${AUTH[@]}" "$SERVER_URL/v1/settings/notifications" >/dev/null; json "${AUTH[@]}" -X PUT -d '{"renewals":true}' "$SERVER_URL/v1/settings/notifications" >/dev/null; echo 'PASS settings'
json "${AUTH[@]}" -X POST -d '{"expoPushToken":"ExpoPushToken[smoke]","platform":"ios"}' "$SERVER_URL/v1/devices" >/dev/null; echo 'PASS register device'
json "${AUTH[@]}" -X PUT -d '{"signingSecret":"whsec_c21tbW9rZQ=="}' "$SERVER_URL/v1/orgs/$ORG_ID/webhook-secret" >/dev/null; echo 'PASS webhook secret'
json "${AUTH[@]}" -X POST "$SERVER_URL/v1/orgs/$ORG_ID/test-push" >/dev/null; echo 'PASS test push'
json "${AUTH[@]}" -X DELETE -d '{"expoPushToken":"ExpoPushToken[smoke]"}' "$SERVER_URL/v1/devices" >/dev/null; echo 'PASS delete device'
json "${AUTH[@]}" -X DELETE "$SERVER_URL/v1/orgs/$ORG_ID" >/dev/null; echo 'PASS delete org'
code=$(status -X GET -H "Authorization: Bearer $TOKEN" "$SERVER_URL/v1/orgs"); [[ "$code" == 200 ]] && echo 'PASS logout precondition' || true
json -X POST -H "Authorization: Bearer $TOKEN" "$SERVER_URL/v1/auth/logout" >/dev/null; code=$(status -H "Authorization: Bearer $TOKEN" "$SERVER_URL/v1/orgs"); [[ "$code" == 401 ]] && echo 'PASS logout invalidates token' || { echo 'FAIL logout'; exit 1; }
