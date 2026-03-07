#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"
RESULT_INPUT="${2:-}"
ACTUAL_HOURS="${3:-2}"
ATTACHMENTS_CSV="${4:-}"

if [[ -z "$TASK_ID" || -z "$RESULT_INPUT" ]]; then
  echo "Usage: $0 <taskId> <resultTextOrFilePath> [actualHours] [attachmentsCsv]" >&2
  exit 1
fi

if [[ -f "$RESULT_INPUT" ]]; then
  RESULT="$(cat "$RESULT_INPUT")"
else
  RESULT="$RESULT_INPUT"
fi

if [[ -n "$ATTACHMENTS_CSV" ]]; then
  ATTACHMENTS_JSON="$(jq -Rn --arg s "$ATTACHMENTS_CSV" '$s | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))')"
else
  ATTACHMENTS_JSON='[]'
fi

PAYLOAD="$(jq -n \
  --arg result "$RESULT" \
  --argjson actualHours "$ACTUAL_HOURS" \
  --argjson attachments "$ATTACHMENTS_JSON" \
  '{result:$result,actualHours:$actualHours,attachments:$attachments}')"

curl -s -X POST "$BASE_URL/api/tasks/$TASK_ID/result" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
