#!/bin/bash

# 演示增强的日志输出功能

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "任务调度日志演示"
echo "========================================"
echo ""
echo "此脚本演示增强后的日志输出，包括："
echo "  1. 📋 任务调度开始"
echo "  2. 🔍 Agent 状态检查"
echo "  3. ⏳ 等待 Agent 空闲（如果需要）"
echo "  4. ✅ Agent 就绪通知"
echo "  5. 📊 任务状态更新"
echo "  6. 👋 任务开始执行"
echo ""
echo "────────────────────────────────────────────"
echo ""

# 创建一个测试任务
echo "创建测试任务..."
TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "日志演示任务",
    "description": "此任务用于演示增强的日志输出功能",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 0.1
  }')

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo "任务已创建，ID: $TASK_ID"
echo ""

echo "────────────────────────────────────────────"
echo "现在开始调度任务（注意观察日志输出）："
echo "────────────────────────────────────────────"
echo ""

# 调度任务
# 为了演示效果，设置较短的检查间隔（10秒）
echo "启动调度..."
echo ""

curl -X POST "$BASE_URL/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"waitForIdle\": true,
    \"maxWait\": 300000,
    \"checkInterval\": 10000
  }" | jq '.'

echo ""
echo "────────────────────────────────────────────"
echo "演示完成！"
echo ""
echo "日志输出说明："
echo "  🚀 任务调度开始"
echo "  📝 任务信息"
echo "  🔍 Agent 状态检查"
echo "  ⏳ 任务排队（如果 Agent 忙碌）"
echo "  🔍 等待循环检查"
echo "  ✅ Agent 空闲，开始调度"
echo "  📊 状态更新"
echo "  👋 任务开始执行"
echo "────────────────────────────────────────────"
echo ""

# 显示最终任务状态
echo "最终任务状态："
curl -s "$BASE_URL/api/tasks/$TASK_ID" | jq '.task | {id, title, status, startedAt}'
echo ""
