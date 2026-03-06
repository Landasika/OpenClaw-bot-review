#!/bin/bash

# 测试任务自动调度器

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "任务自动调度器测试"
echo "========================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 步骤1：检查调度器状态
echo -e "${YELLOW}步骤1：检查调度器状态${NC}"
echo "GET /api/task-scheduler"
echo ""

STATUS=$(curl -s "$BASE_URL/api/task-scheduler")
echo "$STATUS" | jq '.'

RUNNING=$(echo "$STATUS" | jq -r '.scheduler.running')
DISPATCH_COUNT=$(echo "$STATUS" | jq -r '.scheduler.dispatchCount')

echo ""
echo -e "运行状态: ${RUNNING}"
echo -e "已调度任务: ${DISPATCH_COUNT}"
echo ""

# 步骤2：启动调度器（如果未运行）
if [ "$RUNNING" != "true" ]; then
    echo -e "${YELLOW}调度器未运行，正在启动...${NC}"
    echo ""

    curl -s -X POST "$BASE_URL/api/task-scheduler" \
      -H "Content-Type: application/json" \
      -d '{"action": "start"}' | jq '.'

    echo ""
    echo -e "${GREEN}✅ 调度器已启动${NC}"
    echo ""
else
    echo -e "${GREEN}✅ 调度器已在运行${NC}"
    echo ""
fi

# 步骤3：创建测试任务
echo -e "${YELLOW}步骤3：创建测试任务${NC}"
echo "POST /api/tasks"
echo ""

TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试自动调度",
    "description": "这是一个测试自动调度器的任务",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 0.1
  }')

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo "$TASK_RESPONSE" | jq '.task | {id, title, status, assignedTo}'

echo ""
echo -e "任务已创建，ID: ${GREEN}${TASK_ID}${NC}"
echo ""

# 步骤4：检查任务状态
echo -e "${YELLOW}步骤4：检查任务状态${NC}"
echo "等待调度器自动调度（最多等待 90 秒）..."
echo ""

for i in {1..6}; do
    sleep 15
    echo -e "检查 ${i}/6:"

    TASK_STATUS=$(curl -s "$BASE_URL/api/tasks/$TASK_ID")
    CURRENT_STATUS=$(echo "$TASK_STATUS" | jq -r '.task.status')

    echo "  当前状态: $CURRENT_STATUS"

    if [ "$CURRENT_STATUS" = "in_progress" ] || [ "$CURRENT_STATUS" = "submitted" ]; then
        echo ""
        echo -e "${GREEN}✅ 任务已自动调度！${NC}"
        echo ""
        echo "任务详情："
        echo "$TASK_STATUS" | jq '.task | {id, title, status, startedAt, result}'
        break
    fi

    if [ $i -eq 6 ]; then
        echo ""
        echo -e "${RED}❌ 任务未被调度，可能存在问题${NC}"
        echo ""
        echo "调试信息："
        echo "1. 检查调度器状态："
        curl -s "$BASE_URL/api/task-scheduler" | jq '.scheduler'

        echo ""
        echo "2. 检查 Agent 状态："
        curl -s "$BASE_URL/api/agent-activity" | jq '.agents[] | {agentId, state}'
    fi
done

echo ""
echo "========================================"
echo -e "${GREEN}测试完成！${NC}"
echo "========================================"
echo ""
echo "后续步骤："
echo "1. 访问 http://192.168.171.153:3000/tasks"
echo "2. 查看 '📋 任务调度器' 控制面板"
echo "3. 观察调度统计信息"
echo "4. 尝试手动触发调度（点击 '🔄 立即检查'）"
echo ""
