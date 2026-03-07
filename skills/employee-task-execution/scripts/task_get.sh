#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"

if [[ -z "$TASK_ID" ]]; then
  echo "Usage: $0 <taskId>" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  curl -s "$BASE_URL/api/tasks/$TASK_ID" | jq .
else
  curl -s "$BASE_URL/api/tasks/$TASK_ID"
fi
