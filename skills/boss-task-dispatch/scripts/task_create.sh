#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
TITLE="${1:-}"
DESCRIPTION="${2:-}"
ASSIGNED_TO="${3:-}"
PRIORITY="${4:-medium}"
AUTO_DISPATCH="${5:-false}"
DEPENDS_CSV="${6:-}"

if [[ -z "$TITLE" || -z "$DESCRIPTION" ]]; then
  echo "Usage: $0 <title> <description> [assignedTo] [priority] [autoDispatch:true|false] [dependsCsv]" >&2
  exit 1
fi

if [[ -n "$DEPENDS_CSV" ]]; then
  DEPENDS_JSON="$(jq -Rn --arg s "$DEPENDS_CSV" '$s | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))')"
else
  DEPENDS_JSON='[]'
fi

PAYLOAD="$(jq -n \
  --arg title "$TITLE" \
  --arg description "$DESCRIPTION" \
  --arg assignedTo "$ASSIGNED_TO" \
  --arg priority "$PRIORITY" \
  --argjson autoDispatch "$( [[ "$AUTO_DISPATCH" == "true" ]] && echo true || echo false )" \
  --argjson dependsOnTaskIds "$DEPENDS_JSON" \
  '{title:$title,description:$description,priority:$priority,autoDispatch:$autoDispatch,dependsOnTaskIds:$dependsOnTaskIds} + (if $assignedTo == "" then {} else {assignedTo:$assignedTo} end)')"

curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
