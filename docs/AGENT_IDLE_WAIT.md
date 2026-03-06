# Agent 空闲等待功能使用指南

## 📋 功能概述

任务调度系统现在支持 **智能等待 Agent 空闲** 功能：

- ✅ **自动检测 Agent 状态**：检查 Agent 是否正在工作
- ✅ **智能等待**：如果 Agent 忙碌，等待其变为空闲
- ✅ **飞书通知**：实时通知任务排队状态
- ✅ **超时保护**：防止无限等待

---

## 🎯 工作流程

### 传统方式 vs 智能等待

**传统方式**：
```
创建任务 → 立即调度 → ❌ Agent 忙碌 → 调度失败
```

**智能等待方式**：
```
创建任务 → 检查状态 → Agent 忙碌 ⏳
         ↓
    发送排队通知
         ↓
    每30秒检查一次
         ↓
    Agent 空闲 ✅
         ↓
    自动调度执行
```

---

## 🚀 使用方式

### 方式 1：API 调用（自动等待）

```bash
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "waitForIdle": true,
    "maxWait": 1800000,
    "checkInterval": 30000
  }'
```

**参数说明**：
- `waitForIdle`: 是否等待空闲（默认 `true`）
- `maxWait`: 最大等待时间，毫秒（默认 30 分钟）
- `checkInterval`: 检查间隔，毫秒（默认 30 秒）

### 方式 2：创建任务时自动调度

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "搜索最新技术趋势",
    "description": "搜索并总结2024年最热门的AI技术",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'
```

系统会自动：
1. 创建任务
2. 检查 Agent 状态
3. 如果忙碌，等待空闲
4. 自动调度执行

### 方式 3：使用测试脚本

```bash
# 快速检查 Agent 状态
./scripts/test-agent-status-check.sh

# 完整测试等待功能
./scripts/test-agent-idle-wait.sh
```

---

## 📊 Agent 状态说明

### 状态定义

| 状态 | 英文 | 说明 | 可调度 |
|------|------|------|--------|
| 🔨 工作中 | working | Agent 正在执行任务 | ⏳ 等待空闲 |
| 💤 空闲 | idle | Agent 可用，无任务 | ✅ 立即调度 |
| 💀 离线 | offline | Agent 未运行 | ❌ 不可调度 |

### 状态检测

系统通过以下方式检测状态：

1. **读取 Agent 会话文件**
   - 路径：`~/.openclaw/agents/<agentId>/sessions/`
   - 解析最近的 JSONL 文件

2. **判断标准**
   - `working`: 2分钟内有 assistant 消息
   - `idle`: 2-10分钟内活跃
   - `offline`: 超过10分钟未活跃

---

## 📬 飞书通知

### 通知场景

#### 1. 任务排队通知
```
【⏳ 任务排队中】

任务ID: task_1772675200000_abc123
标题: 搜索最新技术趋势
执行人: 牛马-Searcher

状态: 牛马-Searcher 正在执行其他任务
当前任务数: 2

任务已加入队列，等待 牛马-Searcher 空闲后自动执行。
预计等待时间: 10-20 分钟
```

#### 2. Agent 离线通知
```
【⚠️ Agent 离线提醒】

任务ID: task_1772675200000_abc123
标题: 搜索最新技术趋势
执行人: 牛马-Searcher

状态: 牛马-Searcher 当前离线

任务无法调度。请：
1. 检查 牛马-Searcher 是否正常运行
2. 等待 Agent 上线后重试
3. 或将任务重新分配给其他员工
```

#### 3. 任务开始执行通知
```
【👋 任务已领取】

任务ID: task_1772675200000_abc123
标题: 搜索最新技术趋势
执行人: 牛马-Searcher

状态: 已开始执行
时间: 2026-03-05 14:30:25
```

---

## 🔧 高级配置

### 调整等待参数

编辑 `/api/tasks/dispatch/route.ts`：

```typescript
const result = await dispatchTaskToAgent(
  taskId,
  task.assignedTo,
  taskDescription,
  {
    waitForIdle: true,           // 启用等待
    maxWait: 60 * 60 * 1000,     // 最多等待1小时
    checkInterval: 60000         // 每1分钟检查一次
  }
);
```

### 调整状态判断阈值

编辑 `/api/agent-activity/route.ts`：

```typescript
const timeDiff = now - lastActive;

if (timeDiff <= 2 * 60 * 1000) {
  state = 'working';  // 2分钟内 = 工作中
} else if (timeDiff <= 10 * 60 * 1000) {
  state = 'idle';     // 10分钟内 = 空闲
} else {
  state = 'offline';  // 超过10分钟 = 离线
}
```

---

## 🧪 测试示例

### 测试1：检查 Agent 状态

```bash
curl http://localhost:3000/api/agent-activity | jq '.agents[] | {
  agentId,
  state,
  subagents: (.subagents | length)
}'
```

**预期输出**：
```json
{
  "agentId": "niuma-searcher",
  "state": "idle",
  "subagents": 0
}
```

### 测试2：创建并调度任务（Agent 空闲）

```bash
# 1. 创建任务
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试快速调度",
    "description": "这是一个快速测试任务",
    "assignedTo": "niuma-searcher"
  }')

TASK_ID=$(echo $TASK_RESPONSE | jq -r '.task.id')
echo "任务ID: $TASK_ID"

# 2. 立即调度（Agent 空闲时）
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d "{\"taskId\": \"$TASK_ID\"}"
```

**预期结果**：
- 如果 Agent 空闲：立即开始执行
- 如果 Agent 忙碌：进入等待队列

### 测试3：创建并调度任务（Agent 忙碌）

```bash
# 1. 先创建一个长时间任务让 Agent 忙碌
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "长时间任务",
    "description": "搜索并分析100篇技术文章",
    "assignedTo": "niuma-searcher",
    "autoDispatch": true
  }'

# 等待几秒，让任务开始
sleep 5

# 2. 创建第二个任务
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "等待队列任务",
    "description": "此任务会进入队列等待",
    "assignedTo": "niuma-searcher"
  }')

TASK_ID=$(echo $TASK_RESPONSE | jq -r '.task.id')

# 3. 调度第二个任务（会等待第一个完成）
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d "{\"taskId\": \"$TASK_ID\", \"maxWait\": 600000}"
```

**预期结果**：
1. 检测到 Agent 忙碌
2. 发送飞书排队通知
3. 等待第一个任务完成
4. 自动执行第二个任务

---

## 🐛 故障排查

### 问题1：任务一直等待，超时失败

**原因**：Agent 一直处于 `working` 状态

**解决**：
```bash
# 检查 Agent 实际状态
curl http://localhost:3000/api/agent-activity | jq '.agents[] | select(.agentId == "niuma-searcher")'

# 查看子任务详情
curl http://localhost:3000/api/agent-activity | jq '.agents[] | select(.agentId == "niuma-searcher") | .subagents'

# 如果子任务卡住，手动重启 Agent
openclaw agent --agent niuma-searcher --message "exit"
```

### 问题2：Agent 状态显示 offline

**原因**：Agent 进程未运行

**解决**：
```bash
# 检查 Agent 是否运行
openclaw agents list

# 检查 Gateway 是否运行
openclaw daemon status

# 重启 Gateway
openclaw daemon restart
```

### 问题3：飞书通知未发送

**原因**：飞书机器人配置错误

**解决**：
```bash
# 测试飞书机器人
python3 /root/OpenClaw-bot-review/scripts/feishu_bot_send.py \
  --bot boss \
  --chat oc_721c9dd615cb420d023bbbac47c89352 \
  --message "测试消息"

# 检查错误日志
tail -f /root/OpenClaw-bot-review/.next/server/app/logs/*.log
```

---

## 📈 性能优化建议

### 1. 使用合理的检查间隔

```typescript
// 不推荐：间隔太短，浪费资源
checkInterval: 1000  // 1秒

// 推荐：平衡响应速度和资源消耗
checkInterval: 30000 // 30秒

// 适用于紧急任务
checkInterval: 10000 // 10秒
```

### 2. 设置合适的超时时间

```typescript
// 快速任务
maxWait: 10 * 60 * 1000  // 10分钟

// 普通任务（推荐）
maxWait: 30 * 60 * 1000  // 30分钟

// 长时间任务
maxWait: 60 * 60 * 1000  // 1小时
```

### 3. 批量调度优化

```bash
# 不推荐：逐个调度
for task in task1 task2 task3; do
  curl -X POST http://localhost:3000/api/tasks/dispatch \
    -d "{\"taskId\": \"$task\"}"
done

# 推荐：批量自动调度
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{"autoDispatch": true, "limit": 5}'
```

---

## 📚 API 参考

### POST /api/tasks/dispatch

调度单个任务

**请求参数**：
```json
{
  "taskId": "string (必需)",
  "waitForIdle": "boolean (可选，默认 true)",
  "maxWait": "number (可选，毫秒，默认 1800000)",
  "checkInterval": "number (可选，毫秒，默认 30000)"
}
```

**响应**：
```json
{
  "success": true,
  "task": { ... },
  "dispatch": {
    "success": true,
    "taskId": "task_xxx",
    "agentId": "niuma-searcher",
    "response": "...",
    "duration": 15000,
    "timestamp": 1772675200000
  }
}
```

### GET /api/agent-activity

获取所有 Agent 状态

**响应**：
```json
{
  "agents": [
    {
      "agentId": "niuma-searcher",
      "name": "搜索助手",
      "emoji": "🔍",
      "state": "idle",
      "lastActive": 1772675200000,
      "subagents": []
    }
  ]
}
```

---

## 🎉 总结

现在您可以：

1. ✅ 自动检测 Agent 是否空闲
2. ✅ 智能等待 Agent 变为空闲
3. ✅ 实时接收飞书队列通知
4. ✅ 防止任务冲突和资源浪费
5. ✅ 提高任务调度成功率

**开始使用**：
```bash
# 快速测试
./scripts/test-agent-status-check.sh

# 完整测试
./scripts/test-agent-idle-wait.sh
```

祝使用愉快！🚀
