#!/usr/bin/env bash
# End-to-end smoke test: runs the real Worker under `wrangler dev --local`
# against scripts/mock-autumn.ts and exercises every route with curl.
# Uses throwaway state and secrets; never touches .dev.vars or prints secrets.
set -uo pipefail

SERVER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_PORT="${SMOKE_WORKER_PORT:-8787}"
MOCK_PORT="${SMOKE_MOCK_PORT:-8789}"
SERVER="http://127.0.0.1:$WORKER_PORT"
MOCK="http://127.0.0.1:$MOCK_PORT"
STATE="$(mktemp -d "${TMPDIR:-/tmp}/autumn-smoke.XXXXXX")"
ENV_FILE="$STATE/smoke.env"
MOCK_KEY="am_sk_test_smoke_$(openssl rand -hex 6)"
FAILURES=0

umask 077
{
  echo "KEY_ENCRYPTION_KEY=$(openssl rand -base64 32)"
  echo "ALLOW_DEV_LOGIN=true"
  echo "AUTUMN_API_BASE=$MOCK"
  echo "EXPO_PUSH_URL=$MOCK/mock/push"
  echo "PUBLIC_BASE_URL=$SERVER"
} > "$ENV_FILE"

cleanup() {
  [[ -n "${WORKER_PID:-}" ]] && kill "$WORKER_PID" 2>/dev/null
  [[ -n "${MOCK_PID:-}" ]] && kill "$MOCK_PID" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$STATE"
}
trap cleanup EXIT INT TERM

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (expected $3, got $2)"; fi; }

# request METHOD PATH [JSON]: prints the status; body goes to $STATE/body.
request() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sS -o "$STATE/body" -w '%{http_code}' --max-time 20 -X "$method" "$SERVER$path")
  [[ -n "${TOKEN:-}" ]] && args+=(-H "Authorization: Bearer $TOKEN")
  [[ -n "$data" ]] && args+=(-H 'content-type: application/json' -d "$data")
  curl "${args[@]}"
}
body_has() { python3 - "$STATE/body" "$1" <<'PY'
import json, sys
body = json.load(open(sys.argv[1]))
sys.exit(0 if eval(sys.argv[2], {"b": body, "len": len, "all": all, "any": any}) else 1)
PY
}
field() { python3 -c "import json,sys; b=json.load(open('$STATE/body')); print($1)"; }
push_count() { curl -sS --max-time 10 "$MOCK/mock/pushes" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["pushes"]))'; }
last_push_title() { curl -sS --max-time 10 "$MOCK/mock/pushes" | python3 -c 'import json,sys; p=json.load(sys.stdin)["pushes"]; print(p[-1]["title"] if p else "")'; }

cd "$SERVER_DIR"
MOCK_AUTUMN_KEY="$MOCK_KEY" PORT="$MOCK_PORT" bun scripts/mock-autumn.ts > "$STATE/mock.log" 2>&1 &
MOCK_PID=$!
timeout 120 bunx wrangler d1 migrations apply autumn-mobile --local --persist-to "$STATE/d1" > "$STATE/migrate.log" 2>&1 \
  && pass "apply D1 migrations" || { fail "apply D1 migrations"; exit 1; }
bunx wrangler dev --local --ip 127.0.0.1 --port "$WORKER_PORT" --persist-to "$STATE/d1" --env-file "$ENV_FILE" \
  > "$STATE/worker.log" 2>&1 &
WORKER_PID=$!
for _ in $(seq 1 90); do curl -sf "$SERVER/health" > /dev/null && break; sleep 1; done

check "GET /health" "$(request GET /health)" 200
check "unauthenticated /v1/orgs is 401" "$(request GET /v1/orgs)" 401

check "POST /v1/auth/dev" "$(request POST /v1/auth/dev)" 200
TOKEN="$(field 'b["token"]')"

check "create org with a bad key is 400" "$(request POST /v1/orgs '{"name":"Smoke","secretKey":"am_sk_test_not_the_key"}')" 400
body_has 'b["error"]["code"] == "invalid_autumn_key"' && pass "bad key error code" || fail "bad key error code"

check "create org with the mock key" "$(request POST /v1/orgs "{\"name\":\"Smoke Org\",\"secretKey\":\"$MOCK_KEY\"}")" 200
grep -q "$MOCK_KEY" "$STATE/body" && fail "create response leaks the key" || pass "create response has no key"
ORG="$(field 'b["org"]["id"]')"
WEBHOOK_URL="$(field 'b["org"]["webhookUrl"]')"

check "GET /v1/orgs" "$(request GET /v1/orgs)" 200
grep -q "$MOCK_KEY" "$STATE/body" && fail "org list leaks the key" || pass "org list has no key"
check "PATCH org name" "$(request PATCH "/v1/orgs/$ORG" '{"name":"Renamed Smoke Org"}')" 200

check "GET overview" "$(request GET "/v1/orgs/$ORG/overview")" 200
body_has 'len(b["revenue"]["series"]) > 0 and len(b["revenue"]["series"][0]["days"]) == 30' && pass "overview has 30-day revenue" || fail "overview revenue shape"
check "GET subscriptions" "$(request GET "/v1/orgs/$ORG/subscriptions")" 200
body_has 'len(b["items"]) > 0' && pass "subscriptions not empty" || fail "subscriptions empty"
check "GET purchases" "$(request GET "/v1/orgs/$ORG/purchases")" 200
check "GET invoices" "$(request GET "/v1/orgs/$ORG/invoices")" 200
check "GET invoice detail" "$(request GET "/v1/orgs/$ORG/invoices/inv_demo_7")" 200
body_has 'b["invoice"]["id"] == "inv_demo_7"' && pass "invoice detail returns the requested id" || fail "invoice detail id"
check "GET unknown invoice is 404" "$(request GET "/v1/orgs/$ORG/invoices/inv_nope")" 404
check "GET plans" "$(request GET "/v1/orgs/$ORG/plans")" 200
check "GET customers" "$(request GET "/v1/orgs/$ORG/customers")" 200
check "GET customers?search=hoo" "$(request GET "/v1/orgs/$ORG/customers?search=hoo")" 200
body_has '[c["name"] for c in b["items"]] == ["Hooli"]' && pass "customer search filters" || fail "customer search"
check "GET customer detail" "$(request GET "/v1/orgs/$ORG/customers/cus_demo_6")" 200

check "GET settings" "$(request GET /v1/settings/notifications)" 200
body_has 'b["settings"]["renewals"] is False and b["settings"]["purchases"] is True' && pass "settings defaults" || fail "settings defaults"
check "PUT settings renewals=true" "$(request PUT /v1/settings/notifications '{"renewals":true}')" 200

check "register device" "$(request POST /v1/devices '{"expoPushToken":"ExpoPushToken[smoke-device]","platform":"ios"}')" 200
WEBHOOK_SECRET="whsec_$(openssl rand -base64 24)"
check "save webhook secret" "$(request PUT "/v1/orgs/$ORG/webhook-secret" "{\"signingSecret\":\"$WEBHOOK_SECRET\"}")" 200
grep -q "${WEBHOOK_SECRET#whsec_}" "$STATE/body" && fail "webhook secret leaked" || pass "webhook secret not returned"

before="$(push_count)"
check "signed billing.updated webhook" "$(bun scripts/send-test-webhook.ts "$WEBHOOK_URL" "$WEBHOOK_SECRET" billing msg_smoke_1)" 200
sleep 1
check "push recorded for new subscription" "$(push_count)" "$((before + 1))"
check "push title" "$(last_push_title)" "New subscription · \$99 Team"
check "replayed svix-id is accepted" "$(bun scripts/send-test-webhook.ts "$WEBHOOK_URL" "$WEBHOOK_SECRET" billing msg_smoke_1)" 200
sleep 1
check "replay sends no second push" "$(push_count)" "$((before + 1))"
check "signed invoice.finalized renewal" "$(bun scripts/send-test-webhook.ts "$WEBHOOK_URL" "$WEBHOOK_SECRET" renewal msg_smoke_2)" 200
sleep 1
check "renewal push title" "$(last_push_title)" "Renewal · \$29 Pro"
check "bad signature is 400" "$(bun scripts/send-test-webhook.ts "$WEBHOOK_URL" "$WEBHOOK_SECRET" billing msg_smoke_3 --bad)" 400
check "other event types are acknowledged" "$(bun scripts/send-test-webhook.ts "$WEBHOOK_URL" "$WEBHOOK_SECRET" unknown msg_smoke_4)" 200

check "test push" "$(request POST "/v1/orgs/$ORG/test-push")" 200
body_has 'b["sent"] == 1' && pass "test push reached one device" || fail "test push count"
check "delete device" "$(request DELETE /v1/devices '{"expoPushToken":"ExpoPushToken[smoke-device]"}')" 200
check "delete org" "$(request DELETE "/v1/orgs/$ORG")" 200
check "logout" "$(request POST /v1/auth/logout)" 200
check "token rejected after logout" "$(request GET /v1/orgs)" 401

if grep -q "$MOCK_KEY\|${WEBHOOK_SECRET#whsec_}" "$STATE/worker.log"; then fail "worker log contains a secret"; else pass "worker log has no secrets"; fi

echo
if [[ "$FAILURES" -eq 0 ]]; then echo "smoke: all checks passed"; else echo "smoke: $FAILURES check(s) failed"; exit 1; fi
