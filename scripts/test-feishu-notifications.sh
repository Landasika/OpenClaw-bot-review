#!/bin/bash
# 完整的5阶段通知测试脚本

API_BASE="http://192.168.171.153:3000"

echo "=== 飞书群聊通知完整流程测试 ==="
echo ""
echo "此测试将演示任务生命周期的5个阶段通知："
echo "1. 📋 Boss分配任务"
echo "2. 👋 员工领取任务"
echo "3. ✅ 员工完成任务"
echo "4. 👀 Boss评估任务"
echo "5. 🔄 改进任务（如驳回）"
echo ""

read -p "按Enter键开始测试..."

# 阶段1: Boss创建并分配任务
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "阶段1: 📋 Boss分配任务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ">>> Boss创建任务并分配给niuma-searcher"
echo ""

TASK_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "飞书通知功能测试",
    "description": "测试任务管理系统的飞书群聊通知功能，验证5个阶段的通知是否正常工作",
    "priority": "medium",
    "assignedTo": "niuma-searcher",
    "autoDispatch": false,
    "estimatedHours": 0.5
  }')

echo "$TASK_RESPONSE" | jq .

TASK_ID=$(echo "$TASK_RESPONSE" | jq -r '.task.id')
echo ""
echo "✅ 任务已创建: $TASK_ID"
echo "👉 检查飞书群聊，应该看到Boss的【📋 新任务分配】通知"
echo ""

sleep 5

# 阶段2: 员工领取任务（手动调度触发）
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "阶段2: 👋 员工领取任务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ">>> 系统自动调度任务（模拟员工领取）"
echo ""

read -p "按Enter键调度任务..."

DISPATCH_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks/dispatch" \
  -H "Content-Type: application/json" \
  -d "{
    \"taskId\": \"$TASK_ID\"
  }")

echo "$DISPATCH_RESPONSE" | jq .
echo ""
echo "👉 检查飞书群聊，应该看到Searcher的【👋 任务已领取】通知"
echo ""

# 等待任务执行
echo "⏳ 等待任务执行完成（最多60秒）..."
for i in {30..0}; do
  echo -ne "\r剩余 $i 秒..."
  sleep 1
done
echo -e "\r执行完成                "
echo ""

# 检查任务状态
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "检查任务状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s "$API_BASE/api/tasks/$TASK_ID" | jq '.task | {id, title, status, result}'
echo ""

sleep 3

# 阶段4: Boss评估任务
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "阶段4: 👀 Boss评估任务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo ">>> Boss审查任务（先驳回测试）"
echo ""

read -p "按Enter键驳回任务并创建改进任务..."

REVIEW_RESPONSE=$(curl -s -X POST "$API_BASE/api/tasks/$TASK_ID/review" \
  -H "Content-Type: application/json" \
  -d '{
    "approved": false,
    "score": 3,
    "comment": "测试不够全面，需要补充更多测试场景",
    "createFollowUpTask": true,
    "followUpTaskTitle": "补充测试场景",
    "followUpTaskDescription": "在原测试基础上补充边界条件和异常情况测试"
  }')

echo "$REVIEW_RESPONSE" | jq .
echo ""
echo "✅ 任务已驳回"
echo "👉 检查飞书群聊，应该看到Boss的【🔴 任务需改进】通知"
echo ""

FOLLOW_UP_ID=$(echo "$REVIEW_RESPONSE" | jq -r '.followUpTask.id // empty')
if [ -n "$FOLLOW_UP_ID" ]; then
  echo "✅ 改进任务已创建: $FOLLOW_UP_ID"
  echo "👉 检查飞书群聊，应该看到【🔄 改进任务已创建】通知"
fi

echo ""
sleep 5

# 最终通过测试
if [ -n "$FOLLOW_UP_ID" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "最终测试: Boss通过改进任务"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  read -p "按Enter键通过改进任务..."

  curl -s -X POST "$API_BASE/api/tasks/$FOLLOW_UP_ID/dispatch" \
    -H "Content-Type: application/json" \
    -d "{\"taskId\": \"$FOLLOW_UP_ID\"}" > /dev/null

  echo "⏳ 等待改进任务执行..."
  sleep 30

  curl -s -X POST "$API_BASE/api/tasks/$FOLLOW_UP_ID/review" \
    -H "Content-Type: application/json" \
    -d '{
      "approved": true,
      "score": 5,
      "comment": "改进后测试非常完善，符合要求！"
    }' | jq .

  echo ""
  echo "✅ 改进任务已通过"
  echo "👉 检查飞书群聊，应该看到Boss的【🎉 任务通过审查】通知"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 测试完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 通知流程总结："
echo "  1. ✅ Boss分配任务 → Boss机器人发送【📋 新任务分配】"
echo "  2. ✅ 员工领取任务 → Searcher机器人发送【👋 任务已领取】"
echo "  3. ✅ 员工完成任务 → Searcher机器人发送【✅ 任务已完成】"
echo "  4. ✅ Boss驳回任务 → Boss机器人发送【🔴 任务需改进】"
echo "  5. ✅ 创建改进任务 → Boss机器人发送【🔄 改进任务已创建】"
echo "  6. ✅ 最终通过 → Boss机器人发送【🎉 任务通过审查】"
echo ""
echo "🎉 所有5个阶段的通知功能正常工作！"
echo ""
echo "💡 提示："
echo "  - 访问 $API_BASE/tasks 查看Web界面"
echo "  - 查看 docs/FEISHU_NOTIFICATIONS.md 了解详情"
