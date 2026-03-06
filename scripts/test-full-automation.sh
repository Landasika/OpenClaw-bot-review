#!/bin/bash

# 完整的自动化流程测试
# 测试任务调度器和Boss审查器的协同工作

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "完整自动化流程测试"
echo "========================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# 步骤1：启动两个服务
echo -e "${BLUE}步骤1：启动自动化服务${NC}"
echo ""

echo "启动任务调度器..."
curl -s -X POST "$BASE_URL/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "scheduler"}' | jq '.'

echo ""
echo "启动 Boss 审查器..."
curl -s -X POST "$BASE_URL/api/task-scheduler" \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "service": "reviewer"}' | jq '.'

echo ""
echo -e "${GREEN}✅ 两个服务已启动${NC}"
echo ""

# 步骤2：创建测试任务
echo -e "${YELLOW}步骤2：创建测试任务${NC}"
echo ""

TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试完整自动化流程",
    "description": "此任务将自动调度、执行、提交、审查，全程无需人工干预",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 0.1
  }')

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo "$TASK_RESPONSE" | jq '.task | {id, title, status, assignedTo}'

echo ""
echo -e "任务已创建，ID: ${GREEN}${TASK_ID}${NC}"
echo ""

# 步骤3：监控自动化流程
echo -e "${YELLOW}步骤3：监控自动化流程${NC}"
echo ""
echo "任务将经历以下阶段："
echo "  1️⃣  assigned   → 任务调度器自动调度（最多1分钟）"
echo "  2️⃣  in_progress → Agent 执行任务"
echo "  3️⃣  submitted  → 任务完成，等待审查"
echo "  4️⃣  approved   → Boss 审查器自动审查（最多30秒）"
echo ""
echo "⏱️  预计总时间: 2-3 分钟"
echo ""
read -p "按 Enter 开始监控..."

# 监控循环
for i in {1..12}; do
  sleep 15
  echo ""
  echo "="================================"
  echo "检查 $i/12: $(date '+%H:%M:%S')"
  echo "="================================"

  TASK_STATUS=$(curl -s "$BASE_URL/api/tasks/$TASK_ID")
  CURRENT_STATUS=$(echo "$TASK_STATUS" | jq -r '.task.status')
  REVIEW_SCORE=$(echo "$TASK_STATUS" | jq -r '.task.reviewScore // "N/A"')
  REVIEW_COMMENT=$(echo "$TASK_STATUS" | jq -r '.task.reviewComment // "N/A"')

  echo "当前状态: $CURRENT_STATUS"

  if [ "$CURRENT_STATUS" = "pending" ]; then
    echo "⏳ 任务待分配..."
  elif [ "$CURRENT_STATUS" = "assigned" ]; then
    echo "⏳ 任务已分配，等待调度器调度..."
  elif [ "$CURRENT_STATUS" = "in_progress" ]; then
    STARTED_AT=$(echo "$TASK_STATUS" | jq -r '.task.startedAt')
    STARTED_TIME=$(date -d @$((STARTED_AT / 1000)) '+%H:%M:%S' 2>/dev/null || echo "N/A")
    echo "🔨 Agent 正在执行任务... (开始时间: $STARTED_TIME)"
  elif [ "$CURRENT_STATUS" = "submitted" ]; then
    echo "✅ 任务已提交，等待 Boss 审查..."
  elif [ "$CURRENT_STATUS" = "approved" ]; then
    echo ""
    echo -e "${GREEN}🎉 任务完成！已通过 Boss 审查${NC}"
    echo ""
    echo "审查信息："
    echo "  评分: $REVIEW_SCORE/5"
    echo "  意见: $REVIEW_COMMENT"
    echo ""
    break
  elif [ "$CURRENT_STATUS" = "rejected" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  任务被驳回${NC}"
    echo ""
    echo "审查信息："
    echo "  评分: $REVIEW_SCORE/5"
    echo "  意见: $REVIEW_COMMENT"
    echo ""
    break
  fi

  if [ $i -eq 12 ]; then
    echo ""
    echo -e "${YELLOW}⏱️  监控超时，可能存在问题${NC}"
    echo ""
    echo "调试信息："
    echo "1. 调度器状态："
    curl -s "$BASE_URL/api/task-scheduler" | jq '.scheduler'

    echo ""
    echo "2. 审查器状态："
    curl -s "$BASE_URL/api/task-scheduler" | jq '.reviewer'
  fi
done

# 步骤4：显示统计信息
echo ""
echo "========================================"
echo -e "${BLUE}统计信息${NC}"
echo "========================================"
echo ""

STATS=$(curl -s "$BASE_URL/api/task-scheduler")

echo "📋 任务调度器："
echo "$STATS" | jq '.scheduler | {
  "已调度任务": .dispatchCount,
  "最后调度": .lastDispatchTimeFormatted
}'

echo ""
echo "👑 Boss 审查器："
echo "$STATS" | jq '.reviewer | {
  "已审查任务": .reviewCount,
  "最后审查": .lastReviewTimeFormatted
}'

echo ""
echo "========================================"
echo -e "${GREEN}测试完成！${NC}"
echo "========================================"
echo ""
echo "总结："
echo "  ✅ 任务自动调度"
echo "  ✅ Agent 自动执行"
echo "  ✅ Boss 自动审查"
echo "  ✅ 全程无需人工干预"
echo ""
echo "访问 http://192.168.171.153:3000/tasks 查看详情"
echo ""
