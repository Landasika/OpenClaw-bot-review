#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
KICKOFF_FILE="${1:-}"
EMPLOYEE_FILE="${2:-}"
SUMMARY_FILE="${3:-}"

if [[ -z "$KICKOFF_FILE" || -z "$EMPLOYEE_FILE" || -z "$SUMMARY_FILE" ]]; then
  echo "Usage: $0 <kickoffPromptFile> <employeePromptFile> <summaryPromptFile>" >&2
  exit 1
fi

if [[ ! -f "$KICKOFF_FILE" || ! -f "$EMPLOYEE_FILE" || ! -f "$SUMMARY_FILE" ]]; then
  echo "All prompt files must exist" >&2
  exit 1
fi

KICKOFF_TEXT="$(cat "$KICKOFF_FILE")"
EMPLOYEE_TEXT="$(cat "$EMPLOYEE_FILE")"
SUMMARY_TEXT="$(cat "$SUMMARY_FILE")"

PAYLOAD="$(jq -n \
  --arg kickoff "$KICKOFF_TEXT" \
  --arg employee "$EMPLOYEE_TEXT" \
  --arg summary "$SUMMARY_TEXT" \
  '{prompts:{kickoff:$kickoff,employee:$employee,summary:$summary}}')"

curl -s -X POST "$BASE_URL/api/meetings/prompts" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
