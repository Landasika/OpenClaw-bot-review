#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

if command -v jq >/dev/null 2>&1; then
  curl -s "$BASE_URL/api/meetings/settings" | jq .
else
  curl -s "$BASE_URL/api/meetings/settings"
fi
