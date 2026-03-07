#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"

if [[ -z "$TASK_ID" ]]; then
  echo "Usage: $0 <taskId>" >&2
  exit 1
fi

curl -s -X PATCH "$BASE_URL/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' | jq .
