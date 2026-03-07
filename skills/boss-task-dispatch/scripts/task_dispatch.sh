#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"
WAIT_FOR_IDLE="${2:-true}"
MAX_WAIT_MS="${3:-1800000}"
CHECK_INTERVAL_MS="${4:-30000}"

if [[ -z "$TASK_ID" ]]; then
  echo "Usage: $0 <taskId> [waitForIdle:true|false] [maxWaitMs] [checkIntervalMs]" >&2
  exit 1
fi

PAYLOAD="$(jq -n \
  --arg taskId "$TASK_ID" \
  --argjson waitForIdle "$( [[ "$WAIT_FOR_IDLE" == "true" ]] && echo true || echo false )" \
  --argjson maxWait "$MAX_WAIT_MS" \
  --argjson checkInterval "$CHECK_INTERVAL_MS" \
  '{taskId:$taskId,waitForIdle:$waitForIdle,maxWait:$maxWait,checkInterval:$checkInterval}')"

curl -s -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
