#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
AGENT_ID="${1:-}"
LIMIT="${2:-50}"

if [[ -z "$AGENT_ID" ]]; then
  echo "Usage: $0 <agentId> [limit]" >&2
  exit 1
fi

PROMPT_JSON="$(curl -s "$BASE_URL/api/meetings/prompts")"
TASKS_JSON="$(curl -s "$BASE_URL/api/tasks?assignedTo=$AGENT_ID&limit=$LIMIT")"

jq -n \
  --arg agentId "$AGENT_ID" \
  --arg employeePrompt "$(echo "$PROMPT_JSON" | jq -r '.prompts.employee // ""')" \
  --argjson tasks "$(echo "$TASKS_JSON" | jq '.tasks // []')" \
  '{
    agentId:$agentId,
    employeePrompt:$employeePrompt,
    tasks:($tasks | map({id,title,status,priority,blockedReason,updatedAt})),
    focusStatuses:["pending","assigned","blocked","in_progress","rejected"]
  }'
