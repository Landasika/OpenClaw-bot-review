#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
AGENT_ID="${1:-}"
LIMIT="${2:-100}"

if [[ -z "$AGENT_ID" ]]; then
  echo "Usage: $0 <agentId> [limit]" >&2
  exit 1
fi

curl -s "$BASE_URL/api/tasks?assignedTo=$AGENT_ID&limit=$LIMIT" | \
  jq '.tasks[] | {id,title,status,priority,blockedReason,updatedAt}'
