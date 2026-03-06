#!/bin/bash

# 快速测试 Agent 状态检查功能

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "========================================"
echo "Agent 状态检查测试"
echo "========================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试1：获取所有Agent状态
echo -e "${YELLOW}测试1：获取所有Agent活动状态${NC}"
echo "GET /api/agent-activity"
echo ""

ACTIVITY=$(curl -s "$BASE_URL/api/agent-activity")
echo "$ACTIVITY" | jq '.'

echo ""
echo "────────────────────────────────────────────"
echo ""

# 测试2：获取Agent简单状态
echo -e "${YELLOW}测试2：获取Agent简单状态${NC}"
echo "GET /api/agent-status"
echo ""

STATUS=$(curl -s "$BASE_URL/api/agent-status")
echo "$STATUS" | jq '.'

echo ""
echo "────────────────────────────────────────────"
echo ""

# 测试3：检查特定Agent是否空闲
echo -e "${YELLOW}测试3：检查 niuma-searcher 是否空闲${NC}"
echo ""

# 从 activity 中提取状态
SEARCHER_STATE=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-searcher") | .state')
SEARCHER_LAST_ACTIVE=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-searcher") | .lastActive')
SEARCHER_SUBAGENTS=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-searcher") | .subagents | length')

echo "Agent ID: niuma-searcher"
echo "状态: ${SEARCHER_STATE}"
echo "最后活跃: $(date -d @$((SEARCHER_LAST_ACTIVE / 1000)) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/A')"
echo "子任务数: ${SEARCHER_SUBAGENTS}"

if [ "$SEARCHER_STATE" = "idle" ]; then
    echo -e "结论: ${GREEN}✅ 空闲，可以调度${NC}"
elif [ "$SEARCHER_STATE" = "working" ]; then
    echo -e "结论: ${YELLOW}⏳ 正在忙碌，需要等待${NC}"
    if [ "$SEARCHER_SUBAGENTS" -gt 0 ]; then
        echo "       当前有 ${SEARCHER_SUBAGENTS} 个子任务在执行"
    fi
elif [ "$SEARCHER_STATE" = "offline" ]; then
    echo -e "结论: ${RED}❌ 离线，无法调度${NC}"
else
    echo -e "结论: ${BLUE}❓ 未知状态${NC}"
fi

echo ""
echo "────────────────────────────────────────────"
echo ""

# 测试4：检查 niuma-osadmin
echo -e "${YELLOW}测试4：检查 niuma-osadmin 是否空闲${NC}"
echo ""

OSADMIN_STATE=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-osadmin") | .state // "offline"')
OSADMIN_LAST_ACTIVE=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-osadmin") | .lastActive // 0')
OSADMIN_SUBAGENTS=$(echo "$ACTIVITY" | jq -r '.agents[] | select(.agentId == "niuma-osadmin") | .subagents | length // 0')

if [ "$OSADMIN_STATE" != "null" ] && [ -n "$OSADMIN_STATE" ]; then
    echo "Agent ID: niuma-osadmin"
    echo "状态: ${OSADMIN_STATE}"
    if [ "$OSADMIN_LAST_ACTIVE" != "0" ]; then
        echo "最后活跃: $(date -d @$((OSADMIN_LAST_ACTIVE / 1000)) '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/A')"
    fi
    echo "子任务数: ${OSADMIN_SUBAGENTS}"

    if [ "$OSADMIN_STATE" = "idle" ]; then
        echo -e "结论: ${GREEN}✅ 空闲，可以调度${NC}"
    elif [ "$OSADMIN_STATE" = "working" ]; then
        echo -e "结论: ${YELLOW}⏳ 正在忙碌，需要等待${NC}"
    elif [ "$OSADMIN_STATE" = "offline" ]; then
        echo -e "结论: ${RED}❌ 离线，无法调度${NC}"
    else
        echo -e "结论: ${BLUE}❓ 未知状态${NC}"
    fi
else
    echo "Agent ID: niuma-osadmin"
    echo -e "结论: ${RED}❌ 未找到此Agent${NC}"
fi

echo ""
echo "────────────────────────────────────────────"
echo ""

# 测试5：获取待调度任务统计
echo -e "${YELLOW}测试5：获取待调度任务统计${NC}"
echo "GET /api/tasks/dispatch"
echo ""

DISPATCH_STATS=$(curl -s "$BASE_URL/api/tasks/dispatch")
echo "$DISPATCH_STATS" | jq '.'

PENDING=$(echo "$DISPATCH_STATS" | jq -r '.stats.pending')
IN_PROGRESS=$(echo "$DISPATCH_STATS" | jq -r '.stats.inProgress')

echo ""
echo -e "待调度任务: ${BLUE}${PENDING}${NC}"
echo -e "进行中任务: ${GREEN}${IN_PROGRESS}${NC}"

if [ "$PENDING" -gt 0 ]; then
    echo ""
    echo "待调度任务列表："
    echo "$DISPATCH_STATS" | jq -r '.pendingTasks[] | "- \(.id): \(.title) [\(.assignedTo)] [优先级: \(.priority)]"'
fi

echo ""
echo "========================================"
echo -e "${GREEN}测试完成！${NC}"
echo "========================================"
echo ""
echo "状态说明："
echo "  - working: 正在执行任务"
echo "  - idle:    空闲，可以调度新任务"
echo "  - offline: 离线，无法调度"
echo ""
echo "建议："
echo "  - 只在 agent 状态为 'idle' 时调度任务"
echo "  - 如果 agent 正在 'working'，使用 waitForAgentIdle() 等待"
echo "  - 如果 agent 'offline'，通知用户检查 agent 状态"
echo ""
