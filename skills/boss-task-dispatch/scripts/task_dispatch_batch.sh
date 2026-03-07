#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
LIMIT="${1:-5}"

PAYLOAD="$(jq -n --argjson limit "$LIMIT" '{autoDispatch:true,limit:$limit}')"

curl -s -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
