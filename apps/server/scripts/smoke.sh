#!/usr/bin/env bash
set -euo pipefail
: "${SERVER_URL:=http://127.0.0.1:8787}"
: "${SESSION_TOKEN:?Set SESSION_TOKEN from /v1/auth/dev}"
curl --fail --max-time 10 "$SERVER_URL/health"
curl --fail --max-time 10 -H "Authorization: Bearer $SESSION_TOKEN" "$SERVER_URL/v1/orgs"
