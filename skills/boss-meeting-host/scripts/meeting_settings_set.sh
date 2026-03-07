#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
PARTICIPANTS_CSV="${1:-niuma-searcher,niuma-osadmin}"
DAILY_TIME="${2:-09:30}"
TIMEZONE="${3:-Asia/Shanghai}"
STATUSES_CSV="${4:-pending,assigned,blocked,in_progress,rejected}"
ENABLED="${5:-true}"

PARTICIPANTS_JSON="$(jq -Rn --arg s "$PARTICIPANTS_CSV" '$s | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))')"
STATUSES_JSON="$(jq -Rn --arg s "$STATUSES_CSV" '$s | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))')"
ENABLED_JSON="$( [[ "$ENABLED" == "true" ]] && echo true || echo false )"

PAYLOAD="$(jq -n \
  --argjson meetingEnabled "$ENABLED_JSON" \
  --arg meetingDailyTime "$DAILY_TIME" \
  --arg meetingTimezone "$TIMEZONE" \
  --argjson meetingParticipants "$PARTICIPANTS_JSON" \
  --argjson meetingDiscussionStatuses "$STATUSES_JSON" \
  '{
    meetingEnabled:$meetingEnabled,
    meetingDailyTime:$meetingDailyTime,
    meetingTimezone:$meetingTimezone,
    meetingParticipants:$meetingParticipants,
    meetingDiscussionStatuses:$meetingDiscussionStatuses,
    meetingPromptFiles:{
      kickoff:"meeting-kickoff.md",
      employee:"meeting-employee.md",
      summary:"meeting-summary.md"
    }
  }')"

curl -s -X POST "$BASE_URL/api/meetings/settings" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
