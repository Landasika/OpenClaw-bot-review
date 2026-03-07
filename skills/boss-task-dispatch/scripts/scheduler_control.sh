#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ACTION="${1:-status}"
SERVICE="${2:-scheduler}"

print_json() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

if [[ "$ACTION" == "status" ]]; then
  curl -s "$BASE_URL/api/task-scheduler" | print_json
  exit 0
fi

if [[ ! "$ACTION" =~ ^(start|stop|trigger|restart)$ ]]; then
  echo "Usage: $0 [status|start|stop|trigger|restart] [scheduler|reviewer]" >&2
  exit 1
fi

if [[ ! "$SERVICE" =~ ^(scheduler|reviewer)$ ]]; then
  echo "Service must be scheduler or reviewer" >&2
  exit 1
fi

curl -s -X POST "$BASE_URL/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d "{\"service\":\"$SERVICE\",\"action\":\"$ACTION\"}" | print_json
