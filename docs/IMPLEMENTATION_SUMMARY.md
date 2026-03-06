# 方案2实现总结：Agent 空闲等待功能

## ✅ 已完成的功能

### 1. 核心调度逻辑增强 (`lib/task-scheduler.ts`)

#### 新增函数：

**`getAgentStatus(agentId)`** - 获取 Agent 详细状态
- 调用 `/api/agent-activity` 获取实时状态
- 返回：`{ idle, state, subagents }`
- 状态：working, idle, offline

**`checkAgentIdle(agentId)`** - 检查 Agent 是否空闲
- 只有 `idle` 状态返回 true
- `working` 或 `offline` 返回 false

**`waitForAgentIdle(agentId, maxWait, checkInterval)`** - 等待 Agent 变为空闲
- 每30秒检查一次 Agent 状态
- 默认最多等待30分钟
- 实时日志输出等待进度
- 检测到离线时立即停止等待

#### 增强函数：

**`dispatchTaskToAgent(taskId, agentId, taskDescription, options)`**
- 新增 `options` 参数支持：
  - `waitForIdle`: 是否等待空闲（默认 true）
  - `maxWait`: 最大等待时间（默认 30 分钟）
  - `checkInterval`: 检查间隔（默认 30 秒）
- 集成状态检查和等待逻辑
- 失败时返回详细错误信息

---

### 2. 飞书通知增强 (`lib/feishu-notifier.ts`)

#### 新增通知类型：

**`notifyTaskQueued(taskId, taskTitle, agentId, currentTasks)`**
- 任务排队通知
- 告知用户 Agent 正在忙
- 显示当前任务数和预计等待时间

**`notifyAgentOffline(taskId, taskTitle, agentId)`**
- Agent 离线提醒
- 提供处理建议（检查 Agent、重新分配等）

**`notifyAgentReady(taskId, taskTitle, agentId)`**
- Agent 就绪通知
- 任务即将开始执行

---

### 3. API 路由更新 (`app/api/tasks/dispatch/route.ts`)

- 移除旧的 `checkAgentAvailable()` 检查
- 使用新的 `dispatchTaskToAgent()` 选项
- 支持自定义等待参数：
  - `waitForIdle`
  - `maxWait`
  - `checkInterval`

---

### 4. 测试脚本

#### `scripts/test-agent-status-check.sh`
快速检查 Agent 状态：
```bash
./scripts/test-agent-status-check.sh
```

功能：
- 获取所有 Agent 活动状态
- 检查特定 Agent 是否空闲
- 显示子任务信息
- 获取待调度任务统计

#### `scripts/test-agent-idle-wait.sh`
完整测试等待功能：
```bash
./scripts/test-agent-idle-wait.sh
```

功能：
- 创建测试任务
- 调度任务（带等待）
- 实时显示等待进度
- 显示最终执行结果

---

### 5. 文档

#### `docs/AGENT_IDLE_WAIT.md`
完整使用指南，包含：
- 功能概述
- 使用方式
- 状态说明
- 飞书通知示例
- 高级配置
- 测试示例
- 故障排查
- API 参考

---

## 🎯 使用示例

### 基础使用

```bash
# 检查 Agent 状态
curl http://localhost:3000/api/agent-activity | jq '.agents[] | {agentId, state}'

# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试任务",
    "description": "这是一个测试",
    "assignedTo": "niuma-searcher"
  }'

# 调度任务（自动等待空闲）
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "waitForIdle": true
  }'
```

### 高级配置

```bash
# 自定义等待参数
curl -X POST http://localhost:3000/api/tasks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task_xxx",
    "waitForIdle": true,
    "maxWait": 1800000,        # 最多等待30分钟
    "checkInterval": 60000      # 每1分钟检查一次
  }'
```

---

## 📊 工作流程示例

```
场景：Agent 正在执行任务时，有新任务分配

1. Boss 创建任务
   POST /api/tasks
   {
     "title": "新任务",
     "assignedTo": "niuma-searcher"
   }

2. 系统检查 Agent 状态
   GET /api/agent-activity
   → { "state": "working", "subagents": [...] }

3. 发送飞书通知
   【⏳ 任务排队中】
   当前任务数: 2
   预计等待时间: 10-20 分钟

4. 系统等待 Agent 空闲
   - 每30秒检查一次
   - 实时日志输出

5. Agent 完成当前任务，变为空闲
   → { "state": "idle", "subagents": [] }

6. 自动调度新任务
   openclaw agent --agent niuma-searcher --message "..."

7. 发送飞书通知
   【👋 任务已领取】
   状态: 已开始执行

8. 任务完成
   【✅ 任务已完成】
   等待Boss审查
```

---

## 🔧 技术细节

### 状态检测机制

1. **读取会话文件**
   ```typescript
   ~/.openclaw/agents/<agentId>/sessions/*.jsonl
   ```

2. **解析最后活跃时间**
   ```typescript
   const lastActive = getLatestActivityTime(agentId);
   const timeDiff = now - lastActive;
   ```

3. **判断状态**
   ```typescript
   if (timeDiff <= 2 * 60 * 1000) {
     state = 'working';  // 2分钟内
   } else if (timeDiff <= 10 * 60 * 1000) {
     state = 'idle';     // 10分钟内
   } else {
     state = 'offline';  // 超过10分钟
   }
   ```

### 等待逻辑

```typescript
async function waitForAgentIdle(agentId, maxWait, checkInterval) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const status = await getAgentStatus(agentId);

    if (status.idle) return true;    // 空闲，成功
    if (status.state === 'offline') return false; // 离线，失败

    // 等待一段时间再检查
    await sleep(checkInterval);
  }

  return false; // 超时，失败
}
```

---

## 🧪 测试结果

### 当前 Agent 状态

```json
{
  "agentId": "niuma-boss",
  "state": "idle",
  "subagents": 0
}
{
  "agentId": "niuma-searcher",
  "state": "offline",
  "subagents": 0
}
{
  "agentId": "niuma-osadmin",
  "state": "offline",
  "subagents": 0
}
```

### 测试建议

1. **启动 Agent**
   ```bash
   # 确保 niuma-searcher 在线
   openclaw agent --agent niuma-searcher --message "ping"
   ```

2. **运行测试脚本**
   ```bash
   ./scripts/test-agent-status-check.sh
   ```

3. **创建并调度任务**
   ```bash
   ./scripts/test-agent-idle-wait.sh
   ```

---

## 📈 性能指标

- **检查间隔**: 30秒（可配置）
- **默认超时**: 30分钟（可配置）
- **内存占用**: 最小（仅存储状态）
- **CPU 占用**: 低（定期轮询）
- **网络开销**: 低（本地 API 调用）

---

## 🚀 下一步优化建议

1. **实时推送（WebSocket）**
   - 替代轮询机制
   - Agent 空闲时主动推送通知
   - 减少延迟

2. **任务优先级队列**
   - 高优先级任务优先执行
   - 支持任务插队

3. **分布式锁**
   - 防止多个调度任务冲突
   - 使用 Redis 实现锁

4. **监控仪表盘**
   - 实时显示 Agent 状态
   - 任务队列可视化
   - 等待时间统计

---

## 📝 文件清单

### 修改的文件
- `lib/task-scheduler.ts` - 核心调度逻辑
- `lib/feishu-notifier.ts` - 飞书通知
- `app/api/tasks/dispatch/route.ts` - 调度 API

### 新增的文件
- `scripts/test-agent-status-check.sh` - 状态检查测试
- `scripts/test-agent-idle-wait.sh` - 等待功能测试
- `docs/AGENT_IDLE_WAIT.md` - 使用指南
- `docs/IMPLEMENTATION_SUMMARY.md` - 本文档

---

## ✅ 总结

方案2已完整实现！系统现在支持：

1. ✅ 智能检测 Agent 状态
2. ✅ 自动等待 Agent 空闲
3. ✅ 实时飞书通知
4. ✅ 可配置的等待参数
5. ✅ 完整的测试脚本
6. ✅ 详细的文档

**立即开始使用**：
```bash
# 1. 检查 Agent 状态
./scripts/test-agent-status-check.sh

# 2. 测试等待功能
./scripts/test-agent-idle-wait.sh

# 3. 在代码中使用
# lib/task-scheduler.ts
await dispatchTaskToAgent(taskId, agentId, description, {
  waitForIdle: true,
  maxWait: 30 * 60 * 1000
});
```

祝使用愉快！🎉
