#!/bin/bash
# 任务自动调度测试脚本

API_BASE="http://192.168.171.153:3000"

echo "=== 任务自动调度测试 ==="
echo ""

# 测试1: 创建任务并自动调度
echo "1️⃣  创建任务并自动调度"
TASK_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索人工智能最新进展",
    "description": "搜索并总结2024年人工智能领域的最新技术突破和应用案例",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true,
    "estimatedHours": 1
  }')

echo "$TASK_RESPONSE" | jq .

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo ""
echo "✓ 任务创建成功，ID: $TASK_ID"
echo ""

# 等待调度完成
echo "⏳ 等待调度执行（30秒）..."
sleep 30

# 查看任务状态
echo "2️⃣  查看任务状态"
curl -s "$API_BASE/api/tasks/$TASK_ID" | jq '.task | {id, title, status, result}'
echo ""

# 测试2: 批量创建任务
echo "3️⃣  批量创建任务（不自动调度）"
for i in {1..3}; do
  curl -s -X POST "$API_BASE/api/tasks" \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"批量任务 $i\",
      \"description\": \"这是第 $i 个批量任务\",
      \"priority\": \"medium\",
      \"assignedTo\": \"niuma-searcher\",
      \"autoDispatch\": false
    }" | jq '.task.id'
done
echo ""

# 测试3: 批量调度
echo "4️⃣  批量调度所有待执行任务"
DISPATCH_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{
    "autoDispatch": true,
    "limit": 3
  }')

echo "$DISPATCH_RESPONSE" | jq .
echo ""

# 测试4: 查看待调度任务统计
echo "5️⃣  查看待调度任务统计"
curl -s "$API_BASE/api/tasks/dispatch" | jq .
echo ""

# 等待批量调度完成
echo "⏳ 等待批量调度执行（60秒）..."
sleep 60

# 查看所有任务状态
echo "6️⃣  查看所有任务状态"
curl -s "$API_BASE/api/tasks?assignedTo=niuma-searcher" | jq '.tasks[] | {id, title, status}'
echo ""

echo "=== 测试完成 ==="
echo ""
echo "💡 提示："
echo "  - 访问 $API_BASE/tasks 查看Web界面"
echo "  - 使用 openclaw agent --agent niuma-searcher --message \"测试\" 可以手动测试"
