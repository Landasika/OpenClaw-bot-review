#!/bin/bash
# 团队会议功能集成测试脚本

set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"

if ! command -v jq >/dev/null 2>&1; then
  echo "请先安装 jq"
  exit 1
fi

echo "=== 团队会议功能测试 ==="
echo "API: $API_BASE"
echo ""

echo "1) 读取会议设置..."
SETTINGS=$(curl -s "$API_BASE/api/meetings/settings")
echo "$SETTINGS" | jq '{success, defaultAgent, availableAgentsCount: (.availableAgents | length), settings}'
echo ""

echo "2) 保存会议设置（启用 + 每日定时）..."
UPDATE=$(curl -s -X POST "$API_BASE/api/meetings/settings" \
  -H "Content-Type: application/json" \
  -d '{
    "meetingEnabled": true,
    "meetingDailyTime": "09:30",
    "meetingTimezone": "Asia/Shanghai",
    "meetingParticipants": ["niuma-searcher", "niuma-osadmin"],
    "meetingDiscussionStatuses": ["pending", "assigned", "blocked", "in_progress", "rejected"],
    "meetingPromptFiles": {
      "kickoff": "meeting-kickoff.md",
      "employee": "meeting-employee.md",
      "summary": "meeting-summary.md"
    }
  }')

echo "$UPDATE" | jq '{success, settings, runtime}'
echo ""

echo "3) 读取 Prompt..."
PROMPTS=$(curl -s "$API_BASE/api/meetings/prompts")
echo "$PROMPTS" | jq '{success, files, promptLengths: {kickoff: (.prompts.kickoff|length), employee: (.prompts.employee|length), summary: (.prompts.summary|length)}}'
echo ""

echo "4) 手动触发会议..."
RUN=$(curl -s -X POST "$API_BASE/api/meetings/run" -H "Content-Type: application/json" -d '{}')
echo "$RUN" | jq .
MEETING_ID=$(echo "$RUN" | jq -r '.meetingId // empty')
echo ""

echo "5) 查询会议列表..."
LIST=$(curl -s "$API_BASE/api/meetings?limit=5")
echo "$LIST" | jq '{success, count: (.meetings | length), first: (.meetings[0] | {id, status, trigger, startedAt})}'
echo ""

if [ -n "$MEETING_ID" ]; then
  echo "6) 查询会议详情: $MEETING_ID"
  DETAIL=$(curl -s "$API_BASE/api/meetings/$MEETING_ID")
  echo "$DETAIL" | jq '{success, meeting: {id: .meeting.id, status: .meeting.status, notes: (.meeting.notes | length), actions: (.meeting.actionItems | length), errors: (.meeting.errors | length)}}'
  echo ""
fi

echo "=== 测试完成 ==="
