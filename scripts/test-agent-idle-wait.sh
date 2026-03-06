#!/bin/bash

# 测试 Agent 空闲等待功能
# 此脚本测试任务调度系统在 Agent 忙碌时的等待机制

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "测试 Agent 空闲等待功能"
echo "========================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 步骤1：检查 Agent 状态
echo -e "${YELLOW}步骤1：检查 Agent 状态${NC}"
echo "GET /api/agent-activity"
echo ""

ACTIVITY_RESPONSE=$(curl -s "$BASE_URL/api/agent-activity")
echo "$ACTIVITY_RESPONSE" | jq '.'

# 提取 niuma-searcher 的状态
SEARCHER_STATE=$(echo "$ACTIVITY_RESPONSE" | jq -r '.agents[] | select(.agentId == "niuma-searcher") | .state')
echo ""
echo -e "niuma-searcher 状态: ${GREEN}${SEARCHER_STATE}${NC}"
echo ""

# 步骤2：创建测试任务
echo -e "${YELLOW}步骤2：创建测试任务${NC}"
echo "POST /api/tasks"
echo ""

TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试Agent空闲等待功能",
    "description": "此任务用于测试系统在Agent忙碌时的等待机制。任务将在Agent变为空闲后自动执行。",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 0.5
  }')

echo "$TASK_RESPONSE" | jq '.'

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo ""
echo -e "任务已创建，ID: ${GREEN}${TASK_ID}${NC}"
echo ""

# 步骤3：检查调度状态
echo -e "${YELLOW}步骤3：检查待调度任务${NC}"
echo "GET /api/tasks/dispatch"
echo ""

DISPATCH_STATUS=$(curl -s "$BASE_URL/api/tasks/dispatch")
echo "$DISPATCH_STATUS" | jq '.'

PENDING_COUNT=$(echo "$DISPATCH_STATUS" | jq -r '.stats.pending')
echo ""
echo -e "待调度任务数: ${GREEN}${PENDING_COUNT}${NC}"
echo ""

# 步骤4：手动调度任务（带等待）
echo -e "${YELLOW}步骤4：调度任务（会等待Agent空闲）${NC}"
echo "POST /api/tasks/dispatch"
echo ""
echo "此操作将："
echo "1. 检查 Agent 状态"
echo "2. 如果 Agent 忙碌，发送飞书通知（任务排队）"
echo "3. 每30秒检查一次 Agent 状态"
echo "4. Agent 空闲后自动执行任务"
echo ""
read -p "按 Enter 开始调度..."
echo ""

# 调度任务（后台执行，这样可以观察日志）
DISPATCH_START=$(date +%s)

# 使用 timeout 防止无限等待
timeout 1800 curl -s -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"waitForIdle\": true,
    \"maxWait\": 1800000,
    \"checkInterval\": 30000
  }" | jq '.' &

DISPATCH_PID=$!

echo "调度已启动（PID: $DISPATCH_PID)"
echo ""
echo "等待调度完成（最多30分钟）..."
echo ""

# 等待后台进程
wait $DISPATCH_PID 2>/dev/null || true

DISPATCH_END=$(date +%s)
DISPATCH_DURATION=$((DISPATCH_END - DISPATCH_START))

echo ""
echo -e "${GREEN}调度完成！耗时: ${DISPATCH_DURATION}秒${NC}"
echo ""

# 步骤5：检查任务最终状态
echo -e "${YELLOW}步骤5：检查任务状态${NC}"
echo "GET /api/tasks/$TASK_ID"
echo ""

sleep 2  # 等待状态更新

FINAL_TASK=$(curl -s "$BASE_URL/api/tasks/$TASK_ID")
echo "$FINAL_TASK" | jq '.task | {id, title, status, assignedTo, startedAt, completedAt, result}'

FINAL_STATUS=$(echo "$FINAL_TASK" | jq -r '.task.status')
echo ""
echo -e "任务最终状态: ${GREEN}${FINAL_STATUS}${NC}"
echo ""

# 步骤6：总结
echo "========================================"
echo -e "${GREEN}测试完成！${NC}"
echo "========================================"
echo ""
echo "测试结果总结："
echo ""
case "$FINAL_STATUS" in
  "submitted")
    echo -e "✅ ${GREEN}成功${NC} - 任务已提交，等待Boss审查"
    ;;
  "in_progress")
    echo -e "⏳ ${YELLOW}进行中${NC} - 任务正在执行"
    ;;
  "assigned")
    echo -e "⏸️  ${YELLOW}未开始${NC} - 任务仍在队列中"
    ;;
  *)
    echo -e "❌ ${RED}未知状态${NC} - $FINAL_STATUS"
    ;;
esac

echo ""
echo "飞书通知已发送："
echo "1. 任务排队通知（如果Agent忙碌）"
echo "2. 任务开始执行通知"
echo "3. 任务完成通知"
echo ""
echo "查看完整日志："
echo "  tail -f /root/OpenClaw-bot-review/.next/server/app/logs/*.log"
echo ""
