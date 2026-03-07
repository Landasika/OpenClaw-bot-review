#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"
AGENT_ID="${2:-}"

if [[ -z "$TASK_ID" || -z "$AGENT_ID" ]]; then
  echo "Usage: $0 <taskId> <assignedTo>" >&2
  exit 1
fi

curl -s -X POST "$BASE_URL/api/tasks/assign" \
  -H "Content-Type: application/json" \
  -d "{\"taskId\":\"$TASK_ID\",\"assignedTo\":\"$AGENT_ID\"}" | jq .
