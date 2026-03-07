#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
STATUS="${1:-}"
ASSIGNED_TO="${2:-}"
LIMIT="${3:-50}"

QUERY="limit=$LIMIT"
if [[ -n "$STATUS" ]]; then
  QUERY+="&status=$STATUS"
fi
if [[ -n "$ASSIGNED_TO" ]]; then
  QUERY+="&assignedTo=$ASSIGNED_TO"
fi

if command -v jq >/dev/null 2>&1; then
  curl -s "$BASE_URL/api/tasks?$QUERY" | jq '.tasks[] | {id,title,status,assignedTo,priority,blockedReason}'
else
  curl -s "$BASE_URL/api/tasks?$QUERY"
fi
