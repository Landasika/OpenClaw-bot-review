#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TASK_ID="${1:-}"
APPROVED="${2:-false}"
SCORE="${3:-3}"
COMMENT_INPUT="${4:-}"
CREATE_FOLLOW_UP="${5:-true}"
FOLLOW_UP_TITLE="${6:-}"
FOLLOW_UP_DESC="${7:-}"

if [[ -z "$TASK_ID" || -z "$COMMENT_INPUT" ]]; then
  echo "Usage: $0 <taskId> <approved:true|false> <score1-5> <commentTextOrFilePath> [createFollowUp:true|false] [followUpTitle] [followUpDescription]" >&2
  exit 1
fi

if [[ -f "$COMMENT_INPUT" ]]; then
  COMMENT="$(cat "$COMMENT_INPUT")"
else
  COMMENT="$COMMENT_INPUT"
fi

if [[ -z "${COMMENT// }" ]]; then
  echo "comment cannot be empty" >&2
  exit 1
fi

APPROVED_JSON="$( [[ "$APPROVED" == "true" ]] && echo true || echo false )"
FOLLOW_UP_JSON="$( [[ "$CREATE_FOLLOW_UP" == "true" ]] && echo true || echo false )"

PAYLOAD="$(jq -n \
  --argjson approved "$APPROVED_JSON" \
  --argjson score "$SCORE" \
  --arg comment "$COMMENT" \
  --argjson createFollowUpTask "$FOLLOW_UP_JSON" \
  --arg followUpTaskTitle "$FOLLOW_UP_TITLE" \
  --arg followUpTaskDescription "$FOLLOW_UP_DESC" \
  '{approved:$approved,score:$score,comment:$comment,createFollowUpTask:$createFollowUpTask}
   + (if $followUpTaskTitle == "" then {} else {followUpTaskTitle:$followUpTaskTitle} end)
   + (if $followUpTaskDescription == "" then {} else {followUpTaskDescription:$followUpTaskDescription} end)')"

curl -s -X POST "$BASE_URL/api/tasks/$TASK_ID/review" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
