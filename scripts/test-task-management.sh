#!/bin/bash
# 任务管理系统测试脚本

API_BASE="http://192.168.171.153:3000"

echo "=== 任务管理系统测试 ==="
echo ""

# 1. 创建新任务
echo "1. 创建新任务..."
TASK_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试任务：完成项目文档",
    "description": "编写项目的README和使用文档",
    "priority": "high",
    "assignedTo": "niuma-searcher",
    "estimatedHours": 4
  }')

echo "$TASK_RESPONSE" | jq .
TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo "✓ 任务创建成功，ID: $TASK_ID"
echo ""

sleep 1

# 2. 查询任务列表
echo "2. 查询任务列表..."
curl -s "$API_BASE/api/tasks?status=assigned" | jq .
echo ""

sleep 1

# 3. 员工开始执行任务
echo "3. 员工开始执行任务..."
curl -s -X PATCH "$API_BASE/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' | jq .
echo ""

sleep 1

# 4. 员工提交结果
echo "4. 员工提交执行结果..."
RESULT_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks/$TASK_ID/result" \
  -H "Content-Type: application/json" \
  -d '{
    "result": "已完成项目文档编写，包括README.md和USAGE.md",
    "actualHours": 3.5
  }')

echo "$RESULT_RESPONSE" | jq .
echo ""

sleep 1

# 5. Boss审查并驳回
echo "5. Boss审查任务（驳回并要求改进）..."
REVIEW_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks/$TASK_ID/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "comment": "文档缺少API使用示例，需要补充",
    "score": 3,
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充API使用示例",
    "followUpTaskDescription": "在README中添加详细的API调用示例代码"
  }')

echo "$REVIEW_RESPONSE" | jq .

# 检查是否创建了后续任务
FOLLOW_UP_ID=$(echo "$REVIEW_RESPONSE" | jq -r '.followUpTask.id')
if [ "$FOLLOW_UP_ID" != "null" ]; then
  echo "✓ 后续任务创建成功，ID: $FOLLOW_UP_ID"
fi
echo ""

sleep 1

# 6. 查询所有任务
echo "6. 查询所有任务..."
curl -s "$API_BASE/api/tasks" | jq '.tasks[] | {id, title, status, priority}'
echo ""

echo "=== 测试完成 ==="
echo ""
echo "访问 Web 界面: $API_BASE/tasks"
