#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"

curl -s -X POST "$BASE_URL/api/meetings/run" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
